import 'package:mobile_app/core/network/client/response/response.dart';

import 'package:http/http.dart' as http;

class HttpResponseDto extends Response {
  HttpResponseDto._(
    String body,
    int statusCode,
    Map<String, String> headers,
    bool isRedirect,
    String? reasonPhrase,
  ) : super(
          body,
          statusCode,
          headers,
          isRedirect,
          reasonPhrase,
        );
  factory HttpResponseDto.fromHttpResponse(http.Response response) =>
      HttpResponseDto._(
        response.body,
        response.statusCode,
        response.headers,
        response.isRedirect,
        response.reasonPhrase,
      );
}
