import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/authentication/bloc/authentication_bloc.dart';
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
          const AuthenticationStatusChanged(OAuthStatus.authenticated),
          const AuthenticationStatusChanged(OAuthStatus.authenticated),
        );
      });
    });
  });
}
