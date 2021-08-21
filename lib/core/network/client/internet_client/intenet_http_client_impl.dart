import 'dart:async';
import 'dart:convert';
import 'dart:developer';

import 'package:dartz/dartz.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_app/core/error/exceptions.dart';

import 'package:mobile_app/core/network/client/internet_client/internet_client.dart';
import 'package:mobile_app/core/network/client/response/response.dart';
import 'package:mobile_app/core/network/client/response/response_http_impl.dart';

typedef Future<Response> GetOrDeleteFunction(
  Uri url, {
  Map<String, String> headers,
  int maxRetryAttempts,
});
typedef Future<Response> PostOrPutFunction(
  Uri url, {
  Map<String, String> headers,
  Object? body,
  Encoding? encoding,
  int maxRetryAttempts,
});

/// Implementation of [IClient] abstraction. Provides a proxy to [HTTP] http
/// client package.
class HttpClientImpl implements IClient {
  HttpClientImpl(
    this._client, {
    required this.getAccessToken,
    required this.onForbiddenError,
  });
  final http.Client _client;

  ///Function that provides accessToken
  @override
  final FutureOr<Option<String>> Function() getAccessToken;

  /// Function that handles Forbidden server response.
  /// Usually calls refreshToken.
  final FutureOr<void> Function(Response response) onForbiddenError;

  /// Function that handles Server exceptions. Usually maps the
  /// using package exception into Internal app [Exception].

  /// Adds the accessToken to the headers.
  FutureOr<void> _addAccessToken(Map<String, String> headers) async {
    final _accessToken = (await getAccessToken()).fold<String>(
      () => '',
      (accessToken) => accessToken,
    );
    headers['Authorization'] = 'Bearer $_accessToken';
  }

  Future<Response> _getOrDelete(
    GetOrDeleteFunction _getOrDeleteFunction,
    Future<http.Response> Function(Uri url, {Map<String, String>? headers})
        clientFunction,
    Uri url, {
    Map<String, String> headers = const {},
    int maxRetryAttempts = 1,
  }) async {
    if (maxRetryAttempts >= 0) {
      await _addAccessToken(headers);

      final _response = await clientFunction(url, headers: headers);
      final _responseParsed = HttpResponseDto.fromHttpResponse(_response);
      if (_responseParsed.statusCode == 403) {
        await onForbiddenError(_responseParsed);
        try {
          return _getOrDeleteFunction(
            url,
            headers: headers,
            maxRetryAttempts: maxRetryAttempts - 1,
          );
        } on MaxRetryAtteptsReachedException {
          log('Reached maxRetryAttepts.');
        }
      }

      return _responseParsed;
    } else {
      throw const MaxRetryAtteptsReachedException();
    }
  }

  Future<Response> _postOrPut(
    PostOrPutFunction _postOrPutFunction,
    Future<http.Response> Function(
      Uri url, {
      Map<String, String>? headers,
      Object? body,
      Encoding? encoding,
    })
        clientFunction,
    Uri url, {
    Map<String, String> headers = const {},
    Object? body,
    Encoding? encoding,
    int maxRetryAttempts = 1,
  }) async {
    if (maxRetryAttempts >= 0) {
      await _addAccessToken(headers);

      final _response = await clientFunction(
        url,
        headers: headers,
        body: body,
        encoding: encoding,
      );
      final _responseParsed = HttpResponseDto.fromHttpResponse(_response);
      if (_responseParsed.statusCode == 403) {
        await onForbiddenError(_responseParsed);
        try {
          return _postOrPutFunction(
            url,
            headers: headers,
            body: body,
            encoding: encoding,
            maxRetryAttempts: maxRetryAttempts - 1,
          );
        } on MaxRetryAtteptsReachedException {
          log('Reached maxRetryAttepts.');
        }
      }

      return _responseParsed;
    } else {
      throw const MaxRetryAtteptsReachedException();
    }
  }

  @override
  Future<Response> delete(
    Uri url, {
    Map<String, String> headers = const {},
    int maxRetryAttempts = 1,
  }) =>
      _getOrDelete(
        delete,
        _client.delete,
        url,
        headers: headers,
        maxRetryAttempts: maxRetryAttempts,
      );

  @override
  Future<Response> get(
    Uri url, {
    Map<String, String> headers = const {},
    int maxRetryAttempts = 1,
  }) =>
      _getOrDelete(get, _client.get, url,
          headers: headers, maxRetryAttempts: maxRetryAttempts);

  @override
  Future<Response> post(
    Uri url, {
    Map<String, String> headers = const {},
    Object? body,
    Encoding? encoding,
    int maxRetryAttempts = 1,
  }) =>
      _postOrPut(
        post,
        _client.post,
        url,
        body: body,
        encoding: encoding,
        headers: headers,
        maxRetryAttempts: maxRetryAttempts,
      );

  @override
  Future<Response> put(
    Uri url, {
    Map<String, String> headers = const {},
    Object? body,
    Encoding? encoding,
    int maxRetryAttempts = 1,
  }) =>
      _postOrPut(
        put,
        _client.put,
        url,
        body: body,
        encoding: encoding,
        headers: headers,
        maxRetryAttempts: maxRetryAttempts,
      );
}
