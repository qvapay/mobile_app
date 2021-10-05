import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/authentication/bloc/authentication_bloc.dart';
import 'package:mobile_app/authentication/repository/authentication_repository.dart';
import 'package:mocktail/mocktail.dart';
import 'package:qvapay_api_client/qvapay_api_client.dart';

class MockAuthenticationRepository extends Mock
    implements IAuthenticationRepository {}

void main() {
  late IAuthenticationRepository mockAuthenticationRepository;

  setUp(() {
    mockAuthenticationRepository = MockAuthenticationRepository();
    when(() => mockAuthenticationRepository.status).thenAnswer(
      (_) => const Stream.empty(),
    );
  });

  group('AuthenticationBloc', () {
    test('`AuthenticationState.unknown` is the start state', () {
      final authenticationBloc = AuthenticationBloc(
        authenticationRepository: mockAuthenticationRepository,
      );
      expect(authenticationBloc.state, const AuthenticationState.unknown());
      authenticationBloc.close();
    });

    blocTest<AuthenticationBloc, AuthenticationState>(
      'emits [unauthenticated] when status is unauthenticated',
      build: () {
        when(() => mockAuthenticationRepository.status).thenAnswer(
          (_) => Stream.value(OAuthStatus.unauthenticated),
        );
        return AuthenticationBloc(
          authenticationRepository: mockAuthenticationRepository,
        );
      },
      expect: () => const <AuthenticationState>[
        AuthenticationState.unauthenticated(),
      ],
    );
    blocTest<AuthenticationBloc, AuthenticationState>(
      'emits [authenticated] when status is authenticated',
      build: () {
        when(() => mockAuthenticationRepository.status).thenAnswer(
          (_) => Stream.value(OAuthStatus.authenticated),
        );
        return AuthenticationBloc(
          authenticationRepository: mockAuthenticationRepository,
        );
      },
      expect: () => const <AuthenticationState>[
        AuthenticationState.authenticated(),
      ],
    );
  });

  group('AuthenticationStatusChanged', () {
    blocTest<AuthenticationBloc, AuthenticationState>(
      'emits [authenticated] when status is authenticated',
      build: () {
        when(() => mockAuthenticationRepository.status).thenAnswer(
          (_) => Stream.value(OAuthStatus.authenticated),
        );
        return AuthenticationBloc(
          authenticationRepository: mockAuthenticationRepository,
        );
      },
      act: (bloc) => bloc.add(
        const AuthenticationStatusChanged(OAuthStatus.authenticated),
      ),
      expect: () => const <AuthenticationState>[
        AuthenticationState.authenticated(),
      ],
    );

    blocTest<AuthenticationBloc, AuthenticationState>(
      'emits [unauthenticated] when status is unauthenticated',
      build: () {
        when(() => mockAuthenticationRepository.status).thenAnswer(
          (_) => Stream.value(OAuthStatus.unauthenticated),
        );
        return AuthenticationBloc(
          authenticationRepository: mockAuthenticationRepository,
        );
      },
      act: (bloc) => bloc.add(
        const AuthenticationStatusChanged(OAuthStatus.unauthenticated),
      ),
      // TODO: Check this test
      expect: () => const <AuthenticationState>[
        AuthenticationState.unauthenticated(),
      ],
    );
  });

  group('AuthenticationLogoutRequested', () {
    blocTest<AuthenticationBloc, AuthenticationState>(
      'calls logOut on [AuthenticationRepository] '
      'when AuthenticationLogoutRequested is added',
      build: () {
        return AuthenticationBloc(
          authenticationRepository: mockAuthenticationRepository,
        );
      },
      act: (bloc) => bloc.add(AuthenticationLogoutRequested()),
      verify: (_) {
        verify(() => mockAuthenticationRepository.logOut()).called(1);
      },
    );
  });
}
