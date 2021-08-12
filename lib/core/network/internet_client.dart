import 'dart:async';
import 'dart:convert';

/// Internet client abstraction for dealing with Internet HTTP connection.
/// Recieves a generic type [TypeResponse] which is the type of the response
/// of the package will implement this contract.
abstract class InternetClient<TypeResponse> {
  const InternetClient({
    required this.getAccessToken,
    this.onForbiddenError,
    this.onServerEror,
    this.onTimeoutError,
  });

  ///Function that provides accessToken
  final FutureOr<String> Function() getAccessToken;

  /// Function that handles Forbidden server response.
  /// Usually calls refreshToken and tries again.
  final FutureOr<void> Function(TypeResponse response)? onForbiddenError;

  /// Function that handles Server exceptions. Usually maps the
  /// using package exception into Internal app [Exception].
  final FutureOr<void> Function(TypeResponse response)? onServerEror;

  /// Function that handles Timeout exceptions. Usually maps the using
  /// package timeout exception into internal app [Exception].
  final FutureOr<void> Function()? onTimeoutError;

  /// Abstraction for HTTP [GET] method. Recieves [int] retryAttempts which
  /// declare how many times data should be refetched in case of error.
  Future<TypeResponse> get(
    Uri url, {
    Map<String, String> headers,
    int maxRetryAttempts = 1,
  });

  /// Abstraction for HTTP [POST] method. Recieves [int] retryAttempts which
  /// declare how many times data should be refetched in case of error.
  Future<TypeResponse> post(
    Uri url, {
    Map<String, String> headers,
    dynamic body,
    Encoding encoding,
    int maxRetryAttempts = 1,
  });

  /// Abstraction for HTTP [PUT] method. Recieves [int] retryAttempts which
  /// declare how many times data should be refetched in case of error.
  Future<TypeResponse> put(
    Uri url, {
    Map<String, String> headers,
    dynamic body,
    Encoding encoding,
    int maxRetryAttempts = 1,
  });

  /// Abstraction for HTTP [DELETE] method.Recieves [int] retryAttempts which
  /// declare how many times data should be refetched in case of error.
  Future<TypeResponse> delete(
    Uri url, {
    Map<String, String> headers,
    int maxRetryAttempts = 1,
  });
}
