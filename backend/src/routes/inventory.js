import { Router } from 'express';

export function createInventoryRouter(fifoService) {
  const router = Router();

  router.get('/overview', async (_req, res, next) => {
    try {
      const products = await fifoService.getStockOverview();
      const totals = products.reduce(
        (acc, p) => {
          acc.total_products += 1;
          acc.total_units += p.current_quantity;
          acc.total_inventory_cost = Number((acc.total_inventory_cost + p.total_inventory_cost).toFixed(4));
          return acc;
        },
        { total_products: 0, total_units: 0, total_inventory_cost: 0 }
      );
      res.json({ products, totals });
    } catch (err) {
      next(err);
    }
  });

  router.get('/ledger', async (req, res, next) => {
    try {
      const { product_id: productId, event_type: eventType, limit } = req.query;
      const entries = await fifoService.getTransactionLedger({
        productId: productId || null,
        eventType: eventType || null,
        limit,
      });
      res.json({ entries });
    } catch (err) {
      next(err);
    }
  });

  router.get('/batches/:productId', async (req, res, next) => {
    try {
      const includeExhausted = String(req.query.include_exhausted || '').toLowerCase() === 'true';
      const batches = await fifoService.getBatchesByProduct(req.params.productId, includeExhausted);
      res.json({ product_id: req.params.productId, batches });
    } catch (err) {
      next(err);
    }
  });

  router.get('/rejected', async (req, res, next) => {
    try {
      const events = await fifoService.getRejectedEvents(req.query.limit);
      res.json({ events });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
