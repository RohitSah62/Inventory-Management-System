const SCALE = 10000;

function toScaled(value) {
  return Math.round(Number(value) * SCALE);
}

function fromScaled(scaled) {
  return Number((scaled / SCALE).toFixed(4));
}

function round4(value) {
  return Number(Number(value).toFixed(4));
}

export function validateInventoryEvent(rawEvent) {
  if (!rawEvent || typeof rawEvent !== 'object') {
    throw new Error('Event payload must be a JSON object');
  }

  const productId = typeof rawEvent.product_id === 'string' ? rawEvent.product_id.trim() : '';
  if (!productId) {
    throw new Error('product_id is required and must be a non-empty string');
  }

  const eventType = typeof rawEvent.event_type === 'string' ? rawEvent.event_type.trim().toLowerCase() : '';
  if (eventType !== 'purchase' && eventType !== 'sale') {
    throw new Error('event_type must be "purchase" or "sale"');
  }

  const quantity = Number(rawEvent.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('quantity must be a finite number greater than 0');
  }

  let unitPrice = null;
  if (eventType === 'purchase') {
    if (rawEvent.unit_price === undefined || rawEvent.unit_price === null) {
      throw new Error('unit_price is required for purchase events');
    }
    unitPrice = Number(rawEvent.unit_price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error('unit_price must be a finite non-negative number');
    }
  }

  const timestamp = rawEvent.timestamp ? new Date(rawEvent.timestamp) : new Date();
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error('timestamp must be a valid ISO-8601 date string');
  }

  const productName =
    typeof rawEvent.product_name === 'string' && rawEvent.product_name.trim()
      ? rawEvent.product_name.trim()
      : productId;

  const eventId =
    typeof rawEvent.event_id === 'string' && rawEvent.event_id.trim()
      ? rawEvent.event_id.trim()
      : null;

  return {
    product_id: productId,
    product_name: productName,
    event_type: eventType,
    quantity: round4(quantity),
    unit_price: unitPrice !== null ? round4(unitPrice) : null,
    timestamp: timestamp.toISOString(),
    event_id: eventId,
  };
}

export function createFifoService(dbPool, bus = null, options = {}) {
  const useRowLock = options.useRowLock !== false;

  async function recordRejectedEvent(rawPayload, reason) {
    try {
      const productId =
        rawPayload && typeof rawPayload.product_id === 'string' ? rawPayload.product_id.trim() : null;
      const eventType =
        rawPayload && typeof rawPayload.event_type === 'string' ? rawPayload.event_type.trim() : null;

      const { rows } = await dbPool.query(
        `INSERT INTO rejected_events (product_id, event_type, payload, reason)
         VALUES ($1, $2, $3::jsonb, $4)
         RETURNING id, product_id, event_type, payload, reason, created_at`,
        [productId, eventType, JSON.stringify(rawPayload ?? {}), reason]
      );
      if (bus) {
        bus.publish('event_rejected', rows[0]);
      }
      return rows[0];
    } catch {
      return null;
    }
  }

  async function processPurchase(event) {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO products (product_id, name)
         VALUES ($1, $2)
         ON CONFLICT (product_id) DO NOTHING`,
        [event.product_id, event.product_name]
      );

      if (event.event_id) {
        const existing = await client.query(
          `SELECT id FROM inventory_batches WHERE event_id = $1`,
          [event.event_id]
        );
        if (existing.rows.length > 0) {
          await client.query('ROLLBACK');
          return { status: 'duplicate', event_type: 'purchase', event_id: event.event_id };
        }
      }

      const { rows } = await client.query(
        `INSERT INTO inventory_batches (
           product_id, initial_quantity, remaining_quantity, unit_price, purchased_at, event_id
         )
         VALUES ($1, $2, $2, $3, $4, $5)
         RETURNING id, product_id, initial_quantity, remaining_quantity, unit_price, purchased_at, event_id, created_at`,
        [event.product_id, event.quantity, event.unit_price, event.timestamp, event.event_id]
      );

      await client.query('COMMIT');

      const batch = formatBatch(rows[0]);
      if (bus) {
        bus.publish('inventory_updated', { event_type: 'purchase', batch });
      }
      return { status: 'processed', event_type: 'purchase', batch };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async function processSale(event) {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');

      if (event.event_id) {
        const existing = await client.query(
          `SELECT id FROM sales WHERE event_id = $1`,
          [event.event_id]
        );
        if (existing.rows.length > 0) {
          await client.query('ROLLBACK');
          return { status: 'duplicate', event_type: 'sale', event_id: event.event_id };
        }
      }

      const lockClause = useRowLock ? 'FOR UPDATE' : '';
      const { rows: candidateBatches } = await client.query(
        `SELECT id, remaining_quantity, unit_price, purchased_at
         FROM inventory_batches
         WHERE product_id = $1 AND remaining_quantity > 0
         ORDER BY purchased_at ASC, id ASC
         ${lockClause}`,
        [event.product_id]
      );

      const requestedScaled = toScaled(event.quantity);
      const availableScaled = candidateBatches.reduce(
        (sum, b) => sum + toScaled(b.remaining_quantity),
        0
      );

      if (availableScaled < requestedScaled) {
        await client.query('ROLLBACK');
        const reason = `Insufficient stock for ${event.product_id}: requested ${event.quantity}, available ${fromScaled(availableScaled)}`;
        await recordRejectedEvent(event, reason);
        return {
          status: 'rejected',
          event_type: 'sale',
          reason,
          requested_quantity: event.quantity,
          available_quantity: fromScaled(availableScaled),
        };
      }

      let remainingToAllocate = requestedScaled;
      let totalCost = 0;
      const allocations = [];

      for (const batch of candidateBatches) {
        if (remainingToAllocate <= 0) break;

        const batchRemainingScaled = toScaled(batch.remaining_quantity);
        if (batchRemainingScaled <= 0) continue;

        const consumeScaled = Math.min(remainingToAllocate, batchRemainingScaled);
        const consumeQty = fromScaled(consumeScaled);
        const newRemainingQty = fromScaled(batchRemainingScaled - consumeScaled);
        const batchUnitPrice = Number(batch.unit_price);
        const allocationCost = round4(consumeQty * batchUnitPrice);

        await client.query(
          `UPDATE inventory_batches
           SET remaining_quantity = $1
           WHERE id = $2`,
          [newRemainingQty, batch.id]
        );

        allocations.push({
          batch_id: batch.id,
          quantity_consumed: consumeQty,
          unit_price: round4(batchUnitPrice),
          cost: allocationCost,
          purchased_at: batch.purchased_at,
        });

        totalCost = round4(totalCost + allocationCost);
        remainingToAllocate -= consumeScaled;
      }

      const { rows: saleRows } = await client.query(
        `INSERT INTO sales (product_id, quantity_sold, total_cost, sold_at, event_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, product_id, quantity_sold, total_cost, sold_at, event_id, created_at`,
        [event.product_id, event.quantity, totalCost, event.timestamp, event.event_id]
      );

      const saleRecord = saleRows[0];

      for (const alloc of allocations) {
        await client.query(
          `INSERT INTO sale_batch_allocations (sale_id, batch_id, quantity_consumed, unit_price, cost)
           VALUES ($1, $2, $3, $4, $5)`,
          [saleRecord.id, alloc.batch_id, alloc.quantity_consumed, alloc.unit_price, alloc.cost]
        );
      }

      await client.query('COMMIT');

      const sale = {
        id: saleRecord.id,
        product_id: saleRecord.product_id,
        quantity_sold: Number(saleRecord.quantity_sold),
        total_cost: Number(saleRecord.total_cost),
        average_unit_cost: round4(Number(saleRecord.total_cost) / Number(saleRecord.quantity_sold)),
        sold_at: saleRecord.sold_at,
        event_id: saleRecord.event_id,
        created_at: saleRecord.created_at,
        allocations,
      };

      if (bus) {
        bus.publish('inventory_updated', { event_type: 'sale', sale });
      }
      return { status: 'processed', event_type: 'sale', sale };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async function processEvent(rawEvent) {
    let event;
    try {
      event = validateInventoryEvent(rawEvent);
    } catch (err) {
      await recordRejectedEvent(rawEvent, err.message);
      return { status: 'rejected', reason: err.message };
    }

    if (event.event_type === 'purchase') {
      return processPurchase(event);
    }
    return processSale(event);
  }

  async function getStockOverview() {
    const { rows } = await dbPool.query(`
      SELECT
        p.product_id,
        p.name,
        COALESCE(SUM(b.remaining_quantity), 0) AS current_quantity,
        COALESCE(SUM(b.remaining_quantity * b.unit_price), 0) AS total_inventory_cost,
        COUNT(CASE WHEN b.remaining_quantity > 0 THEN 1 END) AS active_batches
      FROM products p
      LEFT JOIN inventory_batches b ON b.product_id = p.product_id
      GROUP BY p.product_id, p.name
      ORDER BY p.product_id ASC
    `);

    return rows.map((row) => {
      const currentQty = round4(row.current_quantity);
      const totalCost = round4(row.total_inventory_cost);
      const avgCost = currentQty > 0 ? round4(totalCost / currentQty) : 0;
      return {
        product_id: row.product_id,
        name: row.name,
        current_quantity: currentQty,
        total_inventory_cost: totalCost,
        average_cost_per_unit: avgCost,
        active_batches: Number(row.active_batches),
      };
    });
  }

  async function getBatchesByProduct(productId, includeExhausted = false) {
    const filter = includeExhausted ? '' : 'AND remaining_quantity > 0';
    const { rows } = await dbPool.query(
      `SELECT id, product_id, initial_quantity, remaining_quantity, unit_price, purchased_at, event_id, created_at
       FROM inventory_batches
       WHERE product_id = $1 ${filter}
       ORDER BY purchased_at ASC, id ASC`,
      [productId]
    );
    return rows.map(formatBatch);
  }

  async function getTransactionLedger({ productId = null, eventType = null, limit = 100 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const params = [];
    let purchaseWhere = '';
    let saleWhere = '';

    if (productId) {
      params.push(productId);
      purchaseWhere = `WHERE b.product_id = $${params.length}`;
      saleWhere = `WHERE s.product_id = $${params.length}`;
    }

    const fetchPurchases = !eventType || eventType === 'purchase';
    const fetchSales = !eventType || eventType === 'sale';

    const entries = [];

    if (fetchPurchases) {
      const { rows: purchaseRows } = await dbPool.query(
        `SELECT
           b.id,
           b.product_id,
           p.name AS product_name,
           b.initial_quantity AS quantity,
           b.remaining_quantity,
           b.unit_price,
           (b.initial_quantity * b.unit_price) AS total_cost,
           b.purchased_at AS event_timestamp,
           b.created_at
         FROM inventory_batches b
         JOIN products p ON p.product_id = b.product_id
         ${purchaseWhere}
         ORDER BY b.purchased_at DESC, b.id DESC
         LIMIT ${safeLimit}`,
        params
      );

      for (const r of purchaseRows) {
        entries.push({
          entry_id: `purchase-${r.id}`,
          id: r.id,
          event_type: 'purchase',
          product_id: r.product_id,
          product_name: r.product_name,
          quantity: round4(r.quantity),
          remaining_quantity: round4(r.remaining_quantity),
          unit_price: round4(r.unit_price),
          total_cost: round4(r.total_cost),
          timestamp: r.event_timestamp,
          created_at: r.created_at,
          allocations: [],
        });
      }
    }

    if (fetchSales) {
      const { rows: saleRows } = await dbPool.query(
        `SELECT
           s.id,
           s.product_id,
           p.name AS product_name,
           s.quantity_sold AS quantity,
           s.total_cost,
           s.sold_at AS event_timestamp,
           s.created_at
         FROM sales s
         JOIN products p ON p.product_id = s.product_id
         ${saleWhere}
         ORDER BY s.sold_at DESC, s.id DESC
         LIMIT ${safeLimit}`,
        params
      );

      let allocationsBySaleId = new Map();
      if (saleRows.length > 0) {
        const saleIds = saleRows.map((s) => s.id);
        const placeholders = saleIds.map((_, idx) => `$${idx + 1}`).join(', ');
        const { rows: allocRows } = await dbPool.query(
          `SELECT id, sale_id, batch_id, quantity_consumed, unit_price, cost
           FROM sale_batch_allocations
           WHERE sale_id IN (${placeholders})
           ORDER BY id ASC`,
          saleIds
        );
        for (const a of allocRows) {
          if (!allocationsBySaleId.has(a.sale_id)) {
            allocationsBySaleId.set(a.sale_id, []);
          }
          allocationsBySaleId.get(a.sale_id).push({
            batch_id: a.batch_id,
            quantity_consumed: round4(a.quantity_consumed),
            unit_price: round4(a.unit_price),
            cost: round4(a.cost),
          });
        }
      }

      for (const r of saleRows) {
        const qty = round4(r.quantity);
        const totalCost = round4(r.total_cost);
        entries.push({
          entry_id: `sale-${r.id}`,
          id: r.id,
          event_type: 'sale',
          product_id: r.product_id,
          product_name: r.product_name,
          quantity: qty,
          unit_price: qty > 0 ? round4(totalCost / qty) : 0,
          total_cost: totalCost,
          timestamp: r.event_timestamp,
          created_at: r.created_at,
          allocations: allocationsBySaleId.get(r.id) || [],
        });
      }
    }

    entries.sort((a, b) => {
      const timeDiff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.id - a.id;
    });

    return entries.slice(0, safeLimit);
  }

  async function getRejectedEvents(limit = 20) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const { rows } = await dbPool.query(
      `SELECT id, product_id, event_type, payload, reason, created_at
       FROM rejected_events
       ORDER BY created_at DESC, id DESC
       LIMIT $1`,
      [safeLimit]
    );
    return rows;
  }

  return {
    processEvent,
    processPurchase,
    processSale,
    getStockOverview,
    getBatchesByProduct,
    getTransactionLedger,
    getRejectedEvents,
  };
}

function formatBatch(row) {
  return {
    id: row.id,
    product_id: row.product_id,
    initial_quantity: round4(row.initial_quantity),
    remaining_quantity: round4(row.remaining_quantity),
    unit_price: round4(row.unit_price),
    remaining_value: round4(Number(row.remaining_quantity) * Number(row.unit_price)),
    purchased_at: row.purchased_at,
    event_id: row.event_id,
    created_at: row.created_at,
  };
}
