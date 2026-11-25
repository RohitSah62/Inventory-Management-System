import crypto from 'node:crypto';

const SAMPLE_PRODUCTS = [
  { product_id: 'PRD001', product_name: 'Wireless Barcode Scanner', basePrice: 100 },
  { product_id: 'PRD002', product_name: 'Thermal Label Printer', basePrice: 240 },
  { product_id: 'PRD003', product_name: 'Smart RFID Tag Pack', basePrice: 45 },
  { product_id: 'PRD004', product_name: 'Industrial Pallet Sensor', basePrice: 175 },
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function round2(num) {
  return Math.round(num * 100) / 100;
}

/**
 * Generates 5-10 realistic purchase & sale events ordered chronologically.
 * Guarantees enough purchases precede sales within the generated batch so FIFO
 * multi-batch consumption is clearly demonstrated even on a fresh database.
 */
export function generateSimulatedBatch(count = 8) {
  const clampedCount = Math.min(Math.max(Number(count) || 8, 5), 10);
  const events = [];
  const batchAvailable = new Map();
  const baseTime = Date.now();

  // Seed initial purchases for 2-3 products first so sales can consume across tiers
  const selectedProducts = SAMPLE_PRODUCTS.slice(0, 3);
  let stepIndex = 0;

  for (const product of selectedProducts) {
    if (events.length >= clampedCount) break;
    const qty = randomInt(25, 60);
    const priceMultiplier = 0.92 + Math.random() * 0.16;
    const unitPrice = round2(product.basePrice * priceMultiplier);

    events.push({
      event_id: `sim-${crypto.randomUUID()}`,
      product_id: product.product_id,
      product_name: product.product_name,
      event_type: 'purchase',
      quantity: qty,
      unit_price: unitPrice,
      timestamp: new Date(baseTime + stepIndex * 1000).toISOString(),
    });
    batchAvailable.set(product.product_id, (batchAvailable.get(product.product_id) || 0) + qty);
    stepIndex += 1;
  }

  // Add second-tier purchases and sales to exercise multi-batch FIFO costing
  while (events.length < clampedCount) {
    const product = SAMPLE_PRODUCTS[randomInt(0, selectedProducts.length - 1)];
    const available = batchAvailable.get(product.product_id) || 0;
    const shouldSell = available >= 15 && Math.random() > 0.42;

    if (shouldSell) {
      const maxSell = Math.max(5, Math.floor(available * 0.75));
      const qty = randomInt(5, maxSell);
      events.push({
        event_id: `sim-${crypto.randomUUID()}`,
        product_id: product.product_id,
        product_name: product.product_name,
        event_type: 'sale',
        quantity: qty,
        timestamp: new Date(baseTime + stepIndex * 1000).toISOString(),
      });
      batchAvailable.set(product.product_id, available - qty);
    } else {
      const qty = randomInt(15, 45);
      const priceMultiplier = 1.02 + Math.random() * 0.18;
      const unitPrice = round2(product.basePrice * priceMultiplier);
      events.push({
        event_id: `sim-${crypto.randomUUID()}`,
        product_id: product.product_id,
        product_name: product.product_name,
        event_type: 'purchase',
        quantity: qty,
        unit_price: unitPrice,
        timestamp: new Date(baseTime + stepIndex * 1000).toISOString(),
      });
      batchAvailable.set(product.product_id, available + qty);
    }
    stepIndex += 1;
  }

  return events;
}
