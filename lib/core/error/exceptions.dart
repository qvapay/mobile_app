///This file contains exceptions. Add Exceptions in here. 
///Some basic exceptions example were provided.

class ServerException implements Exception {
  const ServerException(this.message);

  final String message;
}

class AuthenticationException implements Exception {
  const AuthenticationException(this.message);

  final String message;
}

class CacheException implements Exception {
  const CacheException(this.message);

  final String message;
}
