import 'package:mobile_app/core/error/exceptions.dart';

abstract class Response {
  Response(
    this.body,
    this.statusCode,
    this.headers,
    this.isRedirect,
    this.reasonPhrase,
  );
  final String body;
  final int statusCode;
  final Map<String, String> headers;
  final bool isRedirect;
  final String? reasonPhrase;

  bool get hasExceptions => exceptions.isNotEmpty;

  Iterable<Exception> get exceptions => _analizeResponse();

  List<Exception> _analizeResponse() {
    final _exceptions = <Exception>[];
    if (statusCode == 403) {
      _exceptions.add(const AuthenticationException());
    }
    if (statusCode >= 500) {
      _exceptions.add(
        const ServerException(),
      );
    } else if (statusCode >= 400) {
      _exceptions.add(
        const ClientException(),
      );
    }
    return _exceptions;
  }
}
