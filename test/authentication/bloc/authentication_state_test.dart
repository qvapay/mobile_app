import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/authentication/bloc/authentication_bloc.dart';

void main() {
  group('AuthenticationState', () {
    group('AuthenticationState.unknown', () {
      test('supports value comparisons', () {
        expect(
          const AuthenticationState.unknown(),
          const AuthenticationState.unknown(),
        );
      });
    });

    group('AuthenticationState.authenticated', () {
      test('supports value comparisons', () {
        expect(
          const AuthenticationState.authenticated(),
          const AuthenticationState.authenticated(),
        );
      });
    });

    group('AuthenticationState.unauthenticated', () {
      test('supports value comparisons', () {
        expect(
          const AuthenticationState.unauthenticated(),
          const AuthenticationState.unauthenticated(),
        );
      });
    });
  });
}
