//This file contains exceptions. Add Exceptions in here.
//Some basic exceptions example were provided.

class ServerException implements Exception {
  const ServerException();
}

class AuthenticationException implements Exception {
  const AuthenticationException();
}

class CacheException implements Exception {
  const CacheException();
}

class MaxRetryAtteptsReached implements Exception {
  const MaxRetryAtteptsReached();
}

class ClientException implements Exception {
  const ClientException();
}
