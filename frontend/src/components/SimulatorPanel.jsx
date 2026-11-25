import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Send, Zap } from 'lucide-react';
import { api } from '../api/client.js';

export default function SimulatorPanel({ token, onStatusMessage }) {
  const [batchCount, setBatchCount] = useState(8);
  const [simulating, setSimulating] = useState(false);
  const [autoMode, setAutoMode] = useState(false);

  const [productId, setProductId] = useState('PRD001');
  const [eventType, setEventType] = useState('purchase');
  const [quantity, setQuantity] = useState('50');
  const [unitPrice, setUnitPrice] = useState('100');
  const [sendingCustom, setSendingCustom] = useState(false);

  const autoTimerRef = useRef(null);

  const triggerBatch = async () => {
    setSimulating(true);
    try {
      const res = await api.simulateEvents(token, { count: Number(batchCount) });
      onStatusMessage(
        'info',
        `Published ${res.published_count} events to Kafka topic "inventory-events".`
      );
    } catch (err) {
      onStatusMessage('error', err.message || 'Failed to publish Kafka events');
      setAutoMode(false);
    } finally {
      setSimulating(false);
    }
  };

  useEffect(() => {
    if (!autoMode) {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
      return;
    }

    autoTimerRef.current = setInterval(() => {
      api
        .simulateEvents(token, { count: 5 })
        .then((res) => {
          onStatusMessage('info', `Auto-simulator pushed ${res.published_count} Kafka events.`);
        })
        .catch((err) => {
          onStatusMessage('error', err.message || 'Auto-simulator error');
          setAutoMode(false);
        });
    }, 6000);

    return () => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    };
  }, [autoMode, token, onStatusMessage]);

  const handleCustomSubmit = async (e) => {
    e.preventDefault();
    setSendingCustom(true);
    try {
      const event = {
        product_id: productId.trim(),
        event_type: eventType,
        quantity: Number(quantity),
        timestamp: new Date().toISOString(),
      };
      if (eventType === 'purchase') {
        event.unit_price = Number(unitPrice);
      }
      await api.simulateEvents(token, { event });
      onStatusMessage(
        'info',
        `Published ${eventType} event for ${event.product_id} (qty ${event.quantity}) to Kafka.`
      );
    } catch (err) {
      onStatusMessage('error', err.message || 'Failed to submit custom event');
    } finally {
      setSendingCustom(false);
    }
  };

  return (
    <section className="card">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">
            <Zap size={18} />
            Live Kafka Event Simulator
          </h2>
          <p className="panel-subtitle">
            Push dummy transactions or individual purchase/sale events through Kafka topic{' '}
            <code>inventory-events</code>
          </p>
        </div>
      </div>

      <div className="panel-body sim-grid">
        <div className="sim-box">
          <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>
            Batch Simulator (5–10 Transactions)
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-light)', margin: '0 0 12px' }}>
            Streams chronological purchases and sales so you can observe real-time FIFO batch depletion.
          </p>

          <div className="controls-row">
            <select
              className="select"
              value={batchCount}
              onChange={(e) => setBatchCount(Number(e.target.value))}
              aria-label="Number of transactions to simulate"
            >
              {[5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>
                  {n} transactions
                </option>
              ))}
            </select>

            <button
              type="button"
              className="btn btn-primary"
              onClick={triggerBatch}
              disabled={simulating}
            >
              <Play size={15} />
              {simulating ? 'Publishing...' : 'Simulate Batch'}
            </button>

            <button
              type="button"
              className={`btn ${autoMode ? 'btn-emerald' : ''}`}
              onClick={() => setAutoMode((prev) => !prev)}
            >
              {autoMode ? <Pause size={15} /> : <Play size={15} />}
              {autoMode ? 'Stop Auto-Stream' : 'Auto-Stream (6s)'}
            </button>
          </div>
        </div>

        <form className="sim-box" onSubmit={handleCustomSubmit}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 10 }}>
            Send Single Kafka Event
          </div>
          <div className="custom-form-grid">
            <div>
              <label className="form-label" htmlFor="sim-product">
                Product ID
              </label>
              <input
                id="sim-product"
                className="input"
                style={{ width: '100%' }}
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="form-label" htmlFor="sim-type">
                Event Type
              </label>
              <select
                id="sim-type"
                className="select"
                style={{ width: '100%' }}
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
              >
                <option value="purchase">purchase</option>
                <option value="sale">sale</option>
              </select>
            </div>

            <div>
              <label className="form-label" htmlFor="sim-qty">
                Quantity
              </label>
              <input
                id="sim-qty"
                className="input"
                style={{ width: '100%' }}
                type="number"
                step="any"
                min="0.0001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </div>

            {eventType === 'purchase' && (
              <div>
                <label className="form-label" htmlFor="sim-price">
                  Unit Price ($)
                </label>
                <input
                  id="sim-price"
                  className="input"
                  style={{ width: '100%' }}
                  type="number"
                  step="any"
                  min="0"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  required
                />
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={sendingCustom}
              style={{ height: 37 }}
            >
              <Send size={14} />
              {sendingCustom ? 'Sending...' : 'Push Event'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
