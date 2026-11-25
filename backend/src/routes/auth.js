import { Router } from 'express';

export function createAuthRouter(basicAuthMiddleware) {
  const router = Router();

  router.get('/verify', basicAuthMiddleware, (req, res) => {
    res.json({
      authenticated: true,
      user: req.user,
    });
  });

  return router;
}
