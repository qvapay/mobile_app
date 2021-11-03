// ignore_for_file: prefer_const_constructors

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/authentication/authentication.dart';
import 'package:qvapay_api_client/qvapay_api_client.dart';

void main() {
  group('AuthenticationEvent', () {
    group('LoggedOut', () {
      test('supports value comparisons', () {
        expect(
          AuthenticationLogoutRequested(),
          AuthenticationLogoutRequested(),
        );
      });
    });

    group('AuthenticationStatusChanged', () {
      test('supports value comparisons', () {
        expect(
          AuthenticationStatusChanged(OAuthStatus.authenticated),
          AuthenticationStatusChanged(OAuthStatus.authenticated),
        );
      });
    });
  });
}
