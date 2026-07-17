const admin = require('../config/firebase');
const Provider = require('../models/Provider');
const Request = require('../models/Request');

/**
 * Socket.IO event map:
 *
 *   CLIENT → SERVER:
 *     'auth'                { idToken }              Authenticate socket; joins room `user:<mongoId>`
 *     'provider:join'       { providerId }           Provider dashboard joins `provider:<id>` room
 *     'provider:location'   { requestId, lat, lng }  Provider streams live GPS coordinates
 *
 *   SERVER → CLIENT:
 *     'auth:ok'             {}                       Authentication succeeded
 *     'auth:error'          { message }              Authentication failed
 *     'request:update'      { requestId, status, provider? }
 *     'provider:location'   { requestId, lat, lng }  Broadcast to user's room
 *     'sos:activated'       { requestId, coordinates, mapsLink }
 *     'new_notification'    { notification }         Real-time notification push
 */
function initSockets(io) {
  io.on('connection', (socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    // ── Authentication ──────────────────────────────────────────────────────
    socket.on('auth', async ({ idToken } = {}) => {
      if (!idToken) {
        socket.emit('auth:error', { message: 'No token provided' });
        return;
      }
      try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        socket.data.uid = decoded.uid;
        socket.data.firebaseUid = decoded.uid;
        // Join a room keyed by Firebase UID — the HTTP routes use Mongo _id,
        // so we also store the mapping. The room name used by HTTP routes is
        // `user:<mongo_id>`, set up after we resolve the Mongo user.
        const User = require('../models/User');
        const user = await User.findOne({ firebaseUid: decoded.uid }).lean();
        if (user) {
          socket.data.mongoId = user._id.toString();
          socket.join(`user:${user._id}`);
        }
        socket.join(`firebase:${decoded.uid}`);
        socket.emit('auth:ok', { uid: decoded.uid });
        console.log(`[socket] authenticated: ${socket.id} uid=${decoded.uid}`);
      } catch (err) {
        console.error('[socket] auth failed:', err.message);
        socket.emit('auth:error', { message: 'Invalid or expired token' });
      }
    });

    // ── Provider joins their own room ────────────────────────────────────────
    socket.on('provider:join', ({ providerId } = {}) => {
      if (!providerId) return;
      socket.join(`provider:${providerId}`);
      console.log(`[socket] provider joined room: provider:${providerId}`);
    });

    // ── Provider streams live GPS coordinates ────────────────────────────────
    socket.on('provider:location', async ({ requestId, lat, lng } = {}) => {
      if (!requestId || lat == null || lng == null) return;

      try {
        // Validate: the socket must be authenticated and the provider must own this request
        if (!socket.data.mongoId && !socket.data.uid) return;

        const reqDoc = await Request.findById(requestId).populate('provider').lean();
        if (!reqDoc) return;

        // Check the provider associated with this request is the authenticated socket
        const provider = reqDoc.provider;
        if (!provider) return;

        const ownerId = provider.owner?.toString();
        if (ownerId && socket.data.mongoId && ownerId !== socket.data.mongoId) {
          console.warn(`[socket] unauthorized location update attempt on request ${requestId}`);
          return;
        }

        // Update provider's current location in the database
        await Provider.findByIdAndUpdate(provider._id, {
          $set: { currentLocation: { type: 'Point', coordinates: [lng, lat] } },
        });

        // Broadcast only to the requesting user's room
        io.to(`user:${reqDoc.user}`).emit('provider:location', {
          requestId,
          lat,
          lng,
          providerId: provider._id,
        });
      } catch (err) {
        console.error('[socket] provider:location error:', err.message);
      }
    });

    // ── Disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`[socket] disconnected: ${socket.id}`);
    });
  });
}

module.exports = initSockets;
