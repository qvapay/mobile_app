# QvaPay API Integration Documentation

## Overview

This document explains how the QvaPay React Native app integrates with the QvaPay API for authentication and user management.

## API Endpoints

### Base URL
```
https://api.qvapay.com
```

### Authentication Endpoints

#### 1. Login
- **URL**: `POST /auth/login`
- **Body**:
```json
{
    "email": "user@example.com",
    "password": "userpassword",
    "two_factor_code": "1234"
}
```
- **Response**:
```json
{
    "accessToken": "124009|Ys3KYSLp01bW6yyYu51uxDSpt2GCljdU7bfTWBPF5781a99b",
    "token_type": "Bearer",
    "me": {
        "uuid": "52ff1628-5e91-4083-bc8e-6accce9a7d15",
        "username": "wpiuwe123",
        "name": "Pedro",
        "lastname": "st",
        "two_factor_secret": false,
        "bio": "svwb erberberb",
        "balance": 741.91,
        "satoshis": 0,
        "phone": "+13124045620",
        "phone_verified": 1,
        "kyc": 0,
        "golden_check": 1,
        "golden_expire": "2023-09-09",
        "p2p_enabled": 1,
        "complete_name": "Pedro st <i class=\"fas fa-badge-check text-warning\" title=\"Usuario Verificado Gold\"></i>",
        "name_verified": "Pedro <i class=\"fas fa-badge-check text-warning\" title=\"Usuario Verificado Gold\"></i>",
        "cover_photo_url": "https://media.qvapay.com/covers/timeline.jpg",
        "profile_photo_url": "https://media.qvapay.com/profiles/IQBuWOz6dAQG6sE4n3y6jvAO16caniydxIyoWiJr.jpg",
        "average_rating": "5.00"
    }
}
```

#### 2. Logout (Optional)
- **URL**: `POST /auth/logout`
- **Headers**: `Authorization: Bearer {token}`

#### 3. Get Profile
- **URL**: `GET /auth/me`
- **Headers**: `Authorization: Bearer {token}`

#### 4. Update Profile
- **URL**: `PUT /auth/profile`
- **Headers**: `Authorization: Bearer {token}`

## Implementation Details

### File Structure
```
auth/
├── AuthContext.js      # React Context for auth state management
├── authApi.js          # API functions for authentication
└── screens/
    ├── Login.jsx       # Login screen with 2FA support
    └── ...

api/
└── client.js           # Centralized axios client with interceptors
```

### Key Features

#### 1. Secure Token Storage
- Uses `react-native-keychain` for secure storage of Bearer tokens
- Tokens are automatically added to API requests via interceptors

#### 2. Automatic Token Management
- Request interceptor automatically adds `Authorization: Bearer {token}` header
- Response interceptor handles 401 errors (token expired/invalid)

#### 3. Error Handling
- Comprehensive error handling for network issues
- User-friendly error messages
- Automatic logout on authentication failures

#### 4. User Data Transformation
The API response is transformed to match the app's user data structure:

```javascript
// API Response -> App Structure
const userData = {
    id: apiUser.uuid,                    // UUID as ID
    email: credentials.email,            // Email from login
    name: apiUser.name,                  // First name
    lastname: apiUser.lastname,          // Last name
    username: apiUser.username,          // Username
    bio: apiUser.bio,                    // User bio
    balance: apiUser.balance,            // Account balance
    phone: apiUser.phone,                // Phone number
    phone_verified: apiUser.phone_verified,
    kyc: apiUser.kyc,                    // KYC status
    golden_check: apiUser.golden_check,  // Gold verification
    golden_expire: apiUser.golden_expire,
    p2p_enabled: apiUser.p2p_enabled,    // P2P trading enabled
    profile_photo_url: apiUser.profile_photo_url,
    cover_photo_url: apiUser.cover_photo_url,
    average_rating: apiUser.average_rating,
}
```

## Usage Examples

### Login with 2FA
```javascript
import { useAuth } from '../auth/AuthContext';

const LoginScreen = () => {
    const { login, isLoading, error } = useAuth();
    
    const handleLogin = async () => {
        const result = await login({
            email: 'user@example.com',
            password: 'password123',
            two_factor_code: '1234'
        });
        
        if (result.success) {
            // Navigate to home screen
        } else {
            // Show error message
        }
    };
};
```

### Making Authenticated API Calls
```javascript
import { apiClient } from '../api/client';

// The token is automatically added by the interceptor
const response = await apiClient.get('/some/protected/endpoint');
```

### Logout
```javascript
import { useAuth } from '../auth/AuthContext';

const HomeScreen = () => {
    const { logout } = useAuth();
    
    const handleLogout = async () => {
        await logout(); // Calls API and clears local data
    };
};
```

## Testing Credentials

For development and testing, you can use these credentials:

- **Email**: `amazon@qvapay.com`
- **Password**: `2890367rg20op3ryg`
- **2FA Code**: `1234`

## Error Codes

Common HTTP status codes and their meanings:

- **200**: Success
- **401**: Unauthorized (invalid/expired token)
- **403**: Forbidden (insufficient permissions)
- **422**: Validation error (invalid request data)
- **500**: Server error

## Security Considerations

1. **Token Storage**: Bearer tokens are stored securely in the device keychain
2. **Automatic Cleanup**: Invalid tokens are automatically cleared
3. **Network Security**: All API calls use HTTPS
4. **Error Handling**: Sensitive information is not logged to console

## Future Enhancements

1. **Token Refresh**: Implement automatic token refresh before expiration
2. **Offline Support**: Cache user data for offline access
3. **Biometric Auth**: Add biometric authentication support
4. **Push Notifications**: Integrate push notifications for security alerts 