require('dotenv').config();
const jwt = require('jsonwebtoken');

/**
 * authenticate
 * Verifies the JWT Bearer token from the Authorization header.
 * On success, attaches `req.user = { id, email, role }` and calls next().
 * On failure, responds with 401 Unauthorized.
 */
function authenticate(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach minimal user info to the request object
    req.user = {
      id:    decoded.id,
      email: decoded.email,
      role:  decoded.role,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired. Please log in again.',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid token. Authentication failed.',
    });
  }
}

/**
 * requireAdmin
 * Must be used AFTER authenticate middleware.
 * Checks that req.user.role === 'admin'.
 * On failure, responds with 403 Forbidden.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Forbidden. Admin access required.',
    });
  }
  next();
}

module.exports = { authenticate, requireAdmin };
