import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { api } from '../api/client.js';

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

export default function StockOverview({ products, token }) {
  const [expandedProduct, setExpandedProduct] = useState(null);
  const [batchesByProduct, setBatchesByProduct] = useState({});
  const [loadingProduct, setLoadingProduct] = useState(null);

  const toggleExpand = async (productId) => {
    if (expandedProduct === productId) {
      setExpandedProduct(null);
      return;
    }
    setExpandedProduct(productId);
    setLoadingProduct(productId);
    try {
      const res = await api.getProductBatches(token, productId, false);
      setBatchesByProduct((prev) => ({ ...prev, [productId]: res.batches || [] }));
    } catch {
      setBatchesByProduct((prev) => ({ ...prev, [productId]: [] }));
    } finally {
      setLoadingProduct(null);
    }
  };

  return (
    <section className="card">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">
            <Layers size={18} />
            Product Stock Overview
          </h2>
          <p className="panel-subtitle">
            Live valuation across remaining FIFO inventory batches. Click any row to inspect active batches.
          </p>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="empty-state">
          No inventory batches yet. Use the Kafka Simulator below to stream purchase &amp; sale events.
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                <th>Product ID</th>
                <th>Product Name</th>
                <th className="text-right">Current Quantity</th>
                <th className="text-right">Total Inventory Cost</th>
                <th className="text-right">Avg Cost / Unit</th>
                <th className="text-right">Active Batches</th>
              </tr>
            </thead>
            <tbody>
              {products.map((item) => {
                const isExpanded = expandedProduct === item.product_id;
                const batches = batchesByProduct[item.product_id] || [];
                return (
                  <React.Fragment key={item.product_id}>
                    <tr
                      onClick={() => toggleExpand(item.product_id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </td>
                      <td>
                        <strong>{item.product_id}</strong>
                      </td>
                      <td>{item.name}</td>
                      <td className="text-right tabular">
                        <strong>{formatQty(item.current_quantity)}</strong>
                      </td>
                      <td className="text-right tabular">
                        <strong>{formatCurrency(item.total_inventory_cost)}</strong>
                      </td>
                      <td className="text-right tabular">
                        {formatCurrency(item.average_cost_per_unit)}
                      </td>
                      <td className="text-right tabular">{item.active_batches}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="nested-row">
                        <td colSpan={7}>
                          {loadingProduct === item.product_id ? (
                            <span style={{ color: 'var(--text-light)' }}>Loading FIFO batches...</span>
                          ) : batches.length === 0 ? (
                            <span style={{ color: 'var(--text-light)' }}>
                              No remaining batches in stock for {item.product_id}.
                            </span>
                          ) : (
                            <div>
                              <div
                                style={{
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  color: 'var(--text-light)',
                                  marginBottom: 8,
                                }}
                              >
                                Remaining Batches (FIFO Consumption Order — Oldest First)
                              </div>
                              <table>
                                <thead>
                                  <tr>
                                    <th>Batch #</th>
                                    <th>Purchased At</th>
                                    <th className="text-right">Initial Qty</th>
                                    <th className="text-right">Remaining Qty</th>
                                    <th className="text-right">Unit Price</th>
                                    <th className="text-right">Remaining Value</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {batches.map((b) => (
                                    <tr key={b.id}>
                                      <td className="tabular">#{b.id}</td>
                                      <td>{new Date(b.purchased_at).toLocaleString()}</td>
                                      <td className="text-right tabular">{formatQty(b.initial_quantity)}</td>
                                      <td className="text-right tabular">
                                        <strong>{formatQty(b.remaining_quantity)}</strong>
                                      </td>
                                      <td className="text-right tabular">{formatCurrency(b.unit_price)}</td>
                                      <td className="text-right tabular">
                                        {formatCurrency(b.remaining_value)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
