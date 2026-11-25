import React from 'react';
import { ReceiptText, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(val || 0));
}

function formatQty(val) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 4,
  }).format(Number(val || 0));
}

export default function TransactionLedger({
  entries,
  products,
  filterProduct,
  setFilterProduct,
  filterType,
  setFilterType,
}) {
  return (
    <section className="card">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">
            <ReceiptText size={18} />
            Transaction Ledger
          </h2>
          <p className="panel-subtitle">
            Chronological purchase &amp; sale history with exact FIFO batch consumption breakdown
          </p>
        </div>

        <div className="controls-row">
          <select
            className="select"
            value={filterProduct}
            onChange={(e) => setFilterProduct(e.target.value)}
            aria-label="Filter by product"
          >
            <option value="">All Products</option>
            {products.map((p) => (
              <option key={p.product_id} value={p.product_id}>
                {p.product_id} — {p.name}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            aria-label="Filter by event type"
          >
            <option value="">All Events</option>
            <option value="purchase">Purchases Only</option>
            <option value="sale">Sales Only</option>
          </select>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">No transactions recorded matching the selected filters.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Type</th>
                <th>Product</th>
                <th className="text-right">Quantity</th>
                <th className="text-right">Unit / Avg Cost</th>
                <th className="text-right">Total Cost (FIFO)</th>
                <th>Batch Details / Allocation</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isPurchase = entry.event_type === 'purchase';
                return (
                  <tr key={entry.entry_id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {new Date(entry.timestamp).toLocaleString()}
                    </td>
                    <td>
                      <span className={`badge ${isPurchase ? 'badge-purchase' : 'badge-sale'}`}>
                        {isPurchase ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                        {entry.event_type}
                      </span>
                    </td>
                    <td>
                      <strong>{entry.product_id}</strong>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>
                        {entry.product_name}
                      </div>
                    </td>
                    <td className="text-right tabular">{formatQty(entry.quantity)}</td>
                    <td className="text-right tabular">{formatCurrency(entry.unit_price)}</td>
                    <td className="text-right tabular">
                      <strong>{formatCurrency(entry.total_cost)}</strong>
                    </td>
                    <td>
                      {isPurchase ? (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Batch #{entry.id} ({formatQty(entry.remaining_quantity)} remaining)
                        </span>
                      ) : entry.allocations && entry.allocations.length > 0 ? (
                        <div className="allocation-list">
                          {entry.allocations.map((alloc, idx) => (
                            <span key={`${entry.entry_id}-${alloc.batch_id}-${idx}`} className="allocation-chip tabular">
                              Batch #{alloc.batch_id}: {formatQty(alloc.quantity_consumed)} ×{' '}
                              {formatCurrency(alloc.unit_price)} ={' '}
                              <strong>{formatCurrency(alloc.cost)}</strong>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-light)' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
