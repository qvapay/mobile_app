import 'dart:async';
import 'dart:convert';

import 'package:dartz/dartz.dart';

import 'package:mobile_app/core/network/client/response/response.dart';

/// Internet client abstraction for dealing with Internet HTTP connection.
/// Every method Returns a [Response] object which can be found in:
///
/// package:mobile_app/core/network/client/response/response.dart

abstract class IClient {
  const IClient({
    required this.getAccessToken,
  });

  ///Function that provides accessToken
  final FutureOr<Option<String>> Function() getAccessToken;

  /// Performs an HTTP [GET] call. Recieves [int] maxRetryAttempts which
  /// declares how many times data should be tried to be refetched in case
  /// of error.
  Future<Response> get(
    Uri url, {
    Map<String, String> headers = const {},
    int maxRetryAttempts = 1,
  });

  /// Performs an HTTP [POST] call. Recieves [int] maxRetryAttempts which
  /// declares how many times data should be tried to be refetched in case
  /// of error.
  Future<Response> post(
    Uri url, {
    Map<String, String> headers = const {},
    Object? body,
    Encoding? encoding,
    int maxRetryAttempts = 1,
  });

  /// Performs an HTTP [PUT] call. Recieves [int] maxRetryAttempts which
  /// declares how many times data should be tried to be refetched in case
  /// of error.
  Future<Response> put(
    Uri url, {
    Map<String, String> headers = const {},
    Object? body,
    Encoding? encoding,
    int maxRetryAttempts = 1,
  });

  /// Performs an HTTP [DELETE] call .Recieves [int] maxRetryAttempts which
  /// declares how many times data should be tried to be refetched in case
  /// of error.
  Future<Response> delete(
    Uri url, {
    Map<String, String> headers = const {},
    int maxRetryAttempts = 1,
  });
}
