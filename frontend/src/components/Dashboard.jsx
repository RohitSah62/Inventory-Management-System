import React, { useCallback, useEffect, useState } from 'react';
import {
  Boxes,
  DollarSign,
  LogOut,
  Package,
  RefreshCw,
  TrendingUp,
  X,
} from 'lucide-react';
import { api } from '../api/client.js';
import StockOverview from './StockOverview.jsx';
import TransactionLedger from './TransactionLedger.jsx';
import SimulatorPanel from './SimulatorPanel.jsx';

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

export default function Dashboard({ token, user, onLogout }) {
  const [products, setProducts] = useState([]);
  const [totals, setTotals] = useState({
    total_products: 0,
    total_units: 0,
    total_inventory_cost: 0,
  });
  const [ledger, setLedger] = useState([]);
  const [filterProduct, setFilterProduct] = useState('');
  const [filterType, setFilterType] = useState('');
  const [sseConnected, setSseConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [banner, setBanner] = useState(null);

  const showBanner = useCallback((kind, text) => {
    setBanner({ kind, text });
  }, []);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [overviewRes, ledgerRes] = await Promise.all([
        api.getOverview(token),
        api.getLedger(token, {
          productId: filterProduct,
          eventType: filterType,
          limit: 150,
        }),
      ]);
      setProducts(overviewRes.products || []);
      setTotals(
        overviewRes.totals || { total_products: 0, total_units: 0, total_inventory_cost: 0 }
      );
      setLedger(ledgerRes.entries || []);
    } catch (err) {
      if (err.status === 401) {
        onLogout();
        return;
      }
      showBanner('error', err.message || 'Failed to fetch dashboard data');
    } finally {
      setRefreshing(false);
    }
  }, [token, filterProduct, filterType, onLogout, showBanner]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const streamUrl = api.getStreamUrl(token);
    const source = new EventSource(streamUrl);

    source.addEventListener('connected', () => {
      setSseConnected(true);
    });

    source.addEventListener('inventory_updated', () => {
      loadData();
    });

    source.addEventListener('event_rejected', (evt) => {
      try {
        const parsed = JSON.parse(evt.data);
        const reason = parsed?.data?.reason || 'An inventory event was rejected';
        showBanner('error', reason);
      } catch {
        showBanner('error', 'An inventory event was rejected');
      }
    });

    source.onerror = () => {
      setSseConnected(false);
    };

    return () => {
      source.close();
      setSseConnected(false);
    };
  }, [token, loadData, showBanner]);

  const totalSalesCost = ledger
    .filter((entry) => entry.event_type === 'sale')
    .reduce((sum, entry) => sum + Number(entry.total_cost || 0), 0);

  return (
    <div>
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-icon">
              <Boxes size={20} />
            </div>
            <div>
              <h1 className="brand-title">Inventory Management System (FIFO)</h1>
              <p className="brand-sub">Real-Time Kafka Ingestion &amp; Perpetual Cost Ledger</p>
            </div>
          </div>

          <div className="header-actions">
            <span className={`status-pill ${sseConnected ? 'live' : 'offline'}`}>
              <span className="dot" />
              {sseConnected ? 'Live Stream Active' : 'Reconnecting...'}
            </span>

            <button
              type="button"
              className="btn btn-sm"
              onClick={loadData}
              disabled={refreshing}
            >
              <RefreshCw size={14} />
              Refresh
            </button>

            <span style={{ fontSize: '0.82rem', color: 'var(--text-light)' }}>
              Signed in as <strong>{user?.username}</strong>
            </span>

            <button type="button" className="btn btn-sm" onClick={onLogout}>
              <LogOut size={14} />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="container">
        {banner && (
          <div className={`alert ${banner.kind === 'error' ? 'alert-error' : 'alert-info'}`}>
            <span>{banner.text}</span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setBanner(null)}
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <section className="kpi-grid">
          <div className="card kpi-card">
            <div>
              <p className="kpi-label">Active SKUs</p>
              <p className="kpi-value tabular">{totals.total_products}</p>
            </div>
            <div className="kpi-icon">
              <Package size={19} />
            </div>
          </div>

          <div className="card kpi-card">
            <div>
              <p className="kpi-label">Units On Hand</p>
              <p className="kpi-value tabular">{formatQty(totals.total_units)}</p>
            </div>
            <div className="kpi-icon">
              <Boxes size={19} />
            </div>
          </div>

          <div className="card kpi-card">
            <div>
              <p className="kpi-label">Total Inventory Value</p>
              <p className="kpi-value tabular">{formatCurrency(totals.total_inventory_cost)}</p>
            </div>
            <div className="kpi-icon" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>
              <DollarSign size={19} />
            </div>
          </div>

          <div className="card kpi-card">
            <div>
              <p className="kpi-label">FIFO COGS (Shown Sales)</p>
              <p className="kpi-value tabular">{formatCurrency(totalSalesCost)}</p>
            </div>
            <div className="kpi-icon" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}>
              <TrendingUp size={19} />
            </div>
          </div>
        </section>

        <SimulatorPanel token={token} onStatusMessage={showBanner} />

        <StockOverview products={products} token={token} />

        <TransactionLedger
          entries={ledger}
          products={products}
          filterProduct={filterProduct}
          setFilterProduct={setFilterProduct}
          filterType={filterType}
          setFilterType={setFilterType}
        />
      </main>
    </div>
  );
}
