# Reservario Backend - Deployment Guide

## Railway Deployment

### Required Environment Variables

Set these environment variables in your Railway dashboard:

#### Core Configuration
```
NODE_ENV=production
PORT=3000
```

#### Database
```
MONGODB_URI=your_mongodb_connection_string
```

#### JWT & Security
```
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d
```

#### CORS Configuration
```
CORS_ORIGIN=https://holamanag-frontend.netlify.app
ALLOW_NETLIFY_SUBDOMAINS=true
```

#### Rate Limiting (Optional - defaults provided)
```
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_WINDOW_MS=900000
AUTH_RATE_LIMIT_MAX_REQUESTS=5
```

### CORS Configuration Explained

The backend automatically allows:
1. **Hardcoded**: `https://holamanag-frontend.netlify.app`
2. **Pattern Match**: Any URL containing `holamanag-frontend.netlify.app` (for preview deployments)
3. **Environment Variable**: Custom origins from `CORS_ORIGIN` (comma-separated)
4. **Optional**: All `*.netlify.app` domains if `ALLOW_NETLIFY_SUBDOMAINS=true`

### Deployment Steps

1. **Push Code to GitHub**
   ```bash
   git add .
   git commit -m "Add CORS configuration for production"
   git push origin main
   ```

2. **Configure Railway**
   - Go to Railway dashboard
   - Select your backend project
   - Go to "Variables" tab
   - Add all required environment variables above
   - Save changes

3. **Redeploy**
   - Railway will automatically redeploy when you push to GitHub
   - Or manually trigger a redeploy from the Railway dashboard

4. **Verify**
   - Check deployment logs in Railway
   - Test API health endpoint: `https://your-backend.railway.app/health`
   - Test from frontend: Login should now work

## Netlify Frontend Configuration

### Required Environment Variables

Set these in Netlify dashboard (Build & Deploy → Environment):

```
VITE_API_URL=https://holamanag-backend-production.up.railway.app
```

### Build Settings

- **Base directory**: `holamanag-frontend`
- **Build command**: `npm run build`
- **Publish directory**: `holamanag-frontend/dist`

## Testing CORS Configuration

### Test from Browser Console

```javascript
fetch('https://holamanag-backend-production.up.railway.app/api/v1/health')
  .then(res => res.json())
  .then(data => console.log('API Health:', data))
  .catch(err => console.error('CORS Error:', err));
```

### Expected Response
```json
{
  "success": true,
  "message": "Reservario API is running",
  "timestamp": "2025-10-17T12:00:00.000Z"
}
```

## Common Issues

### Issue 1: CORS Error Persists
**Solution**: 
- Verify `CORS_ORIGIN` includes your Netlify URL
- Check Railway logs for "CORS: Blocked request" messages
- Ensure you've redeployed after setting environment variables

### Issue 2: 404 on API Routes
**Solution**:
- Verify API URL in frontend: `VITE_API_URL`
- Check Railway deployment logs
- Ensure routes include `/api/v1` prefix

### Issue 3: WebSocket Connection Failed
**Solution**:
- WebSocket CORS is automatically configured
- Ensure Railway allows WebSocket connections (it does by default)
- Check browser console for specific WebSocket errors

## Multiple Frontend Deployments

If you have multiple frontend deployments (staging, production, previews):

```
CORS_ORIGIN=https://holamanag-frontend.netlify.app,https://staging--holamanag-frontend.netlify.app
```

Or enable all Netlify subdomains:
```
ALLOW_NETLIFY_SUBDOMAINS=true
```

## Security Recommendations

1. **Use Strong JWT Secret**: Generate with `openssl rand -base64 32`
2. **Enable Rate Limiting**: Keep default values or adjust based on your needs
3. **Monitor Logs**: Check Railway logs regularly for suspicious activity
4. **Whitelist Specific Origins**: Don't use `*` for CORS in production
5. **Use Environment Variables**: Never hardcode secrets in code

## Monitoring

### Health Check Endpoint
```
GET https://your-backend.railway.app/health
```

### API Documentation
```
GET https://your-backend.railway.app/api-docs
```

### WebSocket Status
Check connection at: `wss://your-backend.railway.app/socket.io`

## Rollback Plan

If deployment fails:
1. Check Railway deployment logs
2. Revert to previous working commit
3. Push to GitHub to trigger redeploy
4. Verify environment variables are correct

## Support

For issues:
1. Check Railway deployment logs
2. Check Netlify function logs
3. Check browser console for client-side errors
4. Review API responses for error messages

