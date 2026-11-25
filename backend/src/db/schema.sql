-- Products master table
CREATE TABLE IF NOT EXISTS products (
  product_id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inventory batches created on each purchase event
CREATE TABLE IF NOT EXISTS inventory_batches (
  id SERIAL PRIMARY KEY,
  product_id VARCHAR(64) NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  initial_quantity NUMERIC(18, 4) NOT NULL CHECK (initial_quantity > 0),
  remaining_quantity NUMERIC(18, 4) NOT NULL CHECK (remaining_quantity >= 0 AND remaining_quantity <= initial_quantity),
  unit_price NUMERIC(18, 4) NOT NULL CHECK (unit_price >= 0),
  purchased_at TIMESTAMPTZ NOT NULL,
  event_id VARCHAR(128) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batches_fifo_lookup
  ON inventory_batches (product_id, purchased_at ASC, id ASC)
  WHERE remaining_quantity > 0;

-- Sales recorded with total FIFO cost
CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  product_id VARCHAR(64) NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  quantity_sold NUMERIC(18, 4) NOT NULL CHECK (quantity_sold > 0),
  total_cost NUMERIC(18, 4) NOT NULL CHECK (total_cost >= 0),
  sold_at TIMESTAMPTZ NOT NULL,
  event_id VARCHAR(128) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_product_time
  ON sales (product_id, sold_at DESC);

-- Exact batch-by-batch FIFO consumption breakdown per sale
CREATE TABLE IF NOT EXISTS sale_batch_allocations (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  batch_id INTEGER NOT NULL REFERENCES inventory_batches(id) ON DELETE RESTRICT,
  quantity_consumed NUMERIC(18, 4) NOT NULL CHECK (quantity_consumed > 0),
  unit_price NUMERIC(18, 4) NOT NULL CHECK (unit_price >= 0),
  cost NUMERIC(18, 4) NOT NULL CHECK (cost >= 0)
);

CREATE INDEX IF NOT EXISTS idx_allocations_sale_id
  ON sale_batch_allocations (sale_id);

-- Audit log for rejected/invalid events (e.g. insufficient stock on sale)
CREATE TABLE IF NOT EXISTS rejected_events (
  id SERIAL PRIMARY KEY,
  product_id VARCHAR(64),
  event_type VARCHAR(32),
  payload JSONB NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
