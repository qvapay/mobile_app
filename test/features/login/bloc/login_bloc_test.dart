import 'package:bloc_test/bloc_test.dart';
import 'package:dartz/dartz.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:formz/formz.dart';
import 'package:mobile_app/authentication/authentication.dart';
import 'package:mobile_app/core/error/failures.dart';
import 'package:mobile_app/core/formz/formz.dart';
import 'package:mobile_app/features/login/login.dart';
import 'package:mocktail/mocktail.dart';

class MockAuthenticationRepository extends Mock
    implements AuthenticationRepository {}

void main() {
  late LoginBloc loginBloc;
  late AuthenticationRepository authenticationRepository;

  setUp(() {
    authenticationRepository = MockAuthenticationRepository();
    loginBloc = LoginBloc(authenticationRepository: authenticationRepository);
  });

  const tUserLogin = UserLogin(email: 'test@qvapay', password: 'password');

  group('LoginBloc', () {
    test('initial state is LoginState', () {
      expect(loginBloc.state, const LoginState());
    });

    group('LoginSubmitted', () {
      blocTest<LoginBloc, LoginState>(
        'emits [submissionInProgress, submissionSuccess] '
        'when login succeeds',
        build: () {
          when(() => authenticationRepository.logIn(userLogin: tUserLogin))
              .thenAnswer((_) async => const Right(unit));
          return loginBloc;
        },
        act: (bloc) {
          bloc
            ..add(const LoginEmailChanged('test@qvapay'))
            ..add(const LoginPasswordChanged('password'))
            ..add(const LoginSubmitted());
        },
        expect: () => const <LoginState>[
          LoginState(
            email: EmailFormz.dirty('test@qvapay'),
            status: FormzStatus.invalid,
          ),
          LoginState(
            email: EmailFormz.dirty('test@qvapay'),
            password: PasswordFormz.dirty('password'),
            status: FormzStatus.valid,
          ),
          LoginState(
            email: EmailFormz.dirty('test@qvapay'),
            password: PasswordFormz.dirty('password'),
            status: FormzStatus.submissionInProgress,
          ),
          LoginState(
            email: EmailFormz.dirty('test@qvapay'),
            password: PasswordFormz.dirty('password'),
            status: FormzStatus.submissionSuccess,
          ),
        ],
      );

      blocTest<LoginBloc, LoginState>(
        'emits [LoginInProgress, LoginFailure] when credentials are wrong',
        build: () {
          when(
            () => authenticationRepository.logIn(
              userLogin: const UserLogin(
                email: 'test@qvapay',
                password: 'wrong_password',
              ),
            ),
          ).thenAnswer(
            (_) async =>
                Left(InvalidCredentialsFailure(message: 'Invalid Credentials')),
          );
          return loginBloc;
        },
        act: (bloc) {
          bloc
            ..add(const LoginEmailChanged('test@qvapay'))
            ..add(const LoginPasswordChanged('wrong_password'))
            ..add(const LoginSubmitted());
        },
        expect: () => const <LoginState>[
          LoginState(
            email: EmailFormz.dirty('test@qvapay'),
            status: FormzStatus.invalid,
          ),
          LoginState(
            email: EmailFormz.dirty('test@qvapay'),
            password: PasswordFormz.dirty('wrong_password'),
            status: FormzStatus.valid,
          ),
          LoginState(
            email: EmailFormz.dirty('test@qvapay'),
            password: PasswordFormz.dirty('wrong_password'),
            status: FormzStatus.submissionInProgress,
          ),
          LoginState(
            email: EmailFormz.dirty('test@qvapay'),
            password: PasswordFormz.dirty('wrong_password'),
            status: FormzStatus.submissionFailure,
            messageError: 'Invalid Credentials',
          ),
        ],
      );
    });
  });
}
