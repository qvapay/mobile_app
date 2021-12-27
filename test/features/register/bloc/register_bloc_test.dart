// ignore_for_file: prefer_const_constructors

import 'package:bloc_test/bloc_test.dart';
import 'package:dartz/dartz.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:formz/formz.dart';
import 'package:mobile_app/core/error/failures.dart';
import 'package:mobile_app/core/formz/formz.dart';
import 'package:mobile_app/features/authentication/authentication.dart';
import 'package:mobile_app/features/register/register.dart';
import 'package:mocktail/mocktail.dart';

import '../../../constants.dart';

class MockAuthenticationRepository extends Mock
    implements AuthenticationRepository {}

void main() {
  late RegisterBloc registerBloc;
  late AuthenticationRepository authenticationRepository;

  setUp(() {
    authenticationRepository = MockAuthenticationRepository();
    registerBloc =
        RegisterBloc(authenticationRepository: authenticationRepository);
  });

  const tRegisterState = <RegisterState>[
    RegisterState(
      name: NameFormz.dirty(tName),
      status: FormzStatus.invalid,
    ),
    RegisterState(
      name: NameFormz.dirty(tName),
      email: EmailFormz.dirty(tEmail),
      status: FormzStatus.invalid,
    ),
    RegisterState(
      name: NameFormz.dirty(tName),
      email: EmailFormz.dirty(tEmail),
      password: PasswordFormz.dirty(tPassword),
      status: FormzStatus.valid,
    ),
  ];

  group('RegisterBloc', () {
    test('initial state is RegisterState', () {
      expect(registerBloc.state, const RegisterState());
    });

    group('RegisterSubmitted', () {
      blocTest<RegisterBloc, RegisterState>(
        'emits [submissionInProgress, submissionSuccess] '
        'when register succeeds',
        build: () {
          when(() => authenticationRepository.register(
                userRegister: tUserRegister,
              )).thenAnswer((_) async => const Right(unit));
          return registerBloc;
        },
        act: (bloc) {
          bloc
            ..add(const RegisterNameChanged(tName))
            ..add(const RegisterEmailChanged(tEmail))
            ..add(const RegisterPasswordChanged(tPassword))
            ..add(const RegisterReferralCodeChanged(tReferralCode))
            ..add(const RegisterSubmitted());
        },
        expect: () => <RegisterState>[
          ...tRegisterState,
          const RegisterState(
            name: NameFormz.dirty(tName),
            email: EmailFormz.dirty(tEmail),
            password: PasswordFormz.dirty(tPassword),
            referralCode: tReferralCode,
            status: FormzStatus.valid,
          ),
          const RegisterState(
            name: NameFormz.dirty(tName),
            email: EmailFormz.dirty(tEmail),
            password: PasswordFormz.dirty(tPassword),
            referralCode: tReferralCode,
            status: FormzStatus.submissionInProgress,
          ),
          const RegisterState(
            name: NameFormz.dirty(tName),
            email: EmailFormz.dirty(tEmail),
            password: PasswordFormz.dirty(tPassword),
            referralCode: tReferralCode,
            status: FormzStatus.submissionSuccess,
          ),
        ],
      );
      blocTest<RegisterBloc, RegisterState>(
        'emits [submissionInProgress, submissionSuccess] '
        'when the register is satisfactory and there is no referral code',
        build: () {
          when(() => authenticationRepository.register(
                userRegister: const UserRegister(
                  name: tName,
                  email: tEmail,
                  password: tPassword,
                ),
              )).thenAnswer((_) async => const Right(unit));
          return registerBloc;
        },
        act: (bloc) {
          bloc
            ..add(const RegisterNameChanged(tName))
            ..add(const RegisterEmailChanged(tEmail))
            ..add(const RegisterPasswordChanged(tPassword))
            ..add(const RegisterReferralCodeChanged(null))
            ..add(const RegisterSubmitted());
        },
        expect: () => <RegisterState>[
          ...tRegisterState,
          const RegisterState(
            name: NameFormz.dirty(tName),
            email: EmailFormz.dirty(tEmail),
            password: PasswordFormz.dirty(tPassword),
            status: FormzStatus.submissionInProgress,
          ),
          const RegisterState(
            name: NameFormz.dirty(tName),
            email: EmailFormz.dirty(tEmail),
            password: PasswordFormz.dirty(tPassword),
            status: FormzStatus.submissionSuccess,
          ),
        ],
      );

      blocTest<RegisterBloc, RegisterState>(
        'emits [RegisterInProgress, RegisterFailure] when '
        'the email is already taken',
        build: () {
          when(
            () =>
                authenticationRepository.register(userRegister: tUserRegister),
          ).thenAnswer(
            (_) async =>
                Left(EmailAlreadyTakenFailure(message: 'Email already taken')),
          );
          return registerBloc;
        },
        act: (bloc) {
          bloc
            ..add(const RegisterNameChanged(tName))
            ..add(const RegisterEmailChanged(tEmail))
            ..add(const RegisterPasswordChanged(tPassword))
            ..add(const RegisterReferralCodeChanged(tReferralCode))
            ..add(const RegisterSubmitted());
        },
        expect: () => <RegisterState>[
          ...tRegisterState,
          const RegisterState(
            name: NameFormz.dirty(tName),
            email: EmailFormz.dirty(tEmail),
            password: PasswordFormz.dirty(tPassword),
            referralCode: tReferralCode,
            status: FormzStatus.valid,
          ),
          const RegisterState(
            name: NameFormz.dirty(tName),
            email: EmailFormz.dirty(tEmail),
            password: PasswordFormz.dirty(tPassword),
            referralCode: tReferralCode,
            status: FormzStatus.submissionInProgress,
          ),
          const RegisterState(
            name: NameFormz.dirty(tName),
            email: EmailFormz.dirty(tEmail),
            password: PasswordFormz.dirty(tPassword),
            referralCode: tReferralCode,
            status: FormzStatus.submissionFailure,
            messageError: 'Email already taken',
          ),
        ],
      );
      blocTest<RegisterBloc, RegisterState>(
        'emits [RegisterInProgress, RegisterFailure] when '
        'a server error occurs',
        build: () {
          when(
            () =>
                authenticationRepository.register(userRegister: tUserRegister),
          ).thenAnswer(
            (_) async => const Left(ServerFailure()),
          );
          return registerBloc;
        },
        act: (bloc) {
          bloc
            ..add(const RegisterNameChanged(tName))
            ..add(const RegisterEmailChanged(tEmail))
            ..add(const RegisterPasswordChanged(tPassword))
            ..add(const RegisterReferralCodeChanged(tReferralCode))
            ..add(const RegisterSubmitted());
        },
        expect: () => <RegisterState>[
          ...tRegisterState,
          const RegisterState(
            name: NameFormz.dirty(tName),
            email: EmailFormz.dirty(tEmail),
            password: PasswordFormz.dirty(tPassword),
            referralCode: tReferralCode,
            status: FormzStatus.valid,
          ),
          const RegisterState(
            name: NameFormz.dirty(tName),
            email: EmailFormz.dirty(tEmail),
            password: PasswordFormz.dirty(tPassword),
            referralCode: tReferralCode,
            status: FormzStatus.submissionInProgress,
          ),
          const RegisterState(
            name: NameFormz.dirty(tName),
            email: EmailFormz.dirty(tEmail),
            password: PasswordFormz.dirty(tPassword),
            referralCode: tReferralCode,
            status: FormzStatus.submissionFailure,
            messageError: 'Server Failure',
          ),
        ],
      );
    });

    group('RegisterCompleteChanged', () {
      blocTest<RegisterBloc, RegisterState>(
        'emits [submissionInProgress, submissionSuccess, complete] '
        'when login succeeds',
        build: () {
          when(() => authenticationRepository.register(
                userRegister: tUserRegister,
              )).thenAnswer((_) async => const Right(unit));
          return registerBloc;
        },
        act: (bloc) {
          bloc
            ..add(const RegisterNameChanged(tName))
            ..add(const RegisterEmailChanged(tEmail))
            ..add(const RegisterPasswordChanged(tPassword))
            ..add(const RegisterReferralCodeChanged(tReferralCode))
            ..add(const RegisterSubmitted())
            ..add(const RegisterCompleteChanged());
        },
        expect: () => <RegisterState>[
          ...tRegisterState,
          const RegisterState(
            name: NameFormz.dirty(tName),
            email: EmailFormz.dirty(tEmail),
            password: PasswordFormz.dirty(tPassword),
            referralCode: tReferralCode,
            status: FormzStatus.valid,
          ),
          const RegisterState(
            name: NameFormz.dirty(tName),
            email: EmailFormz.dirty(tEmail),
            password: PasswordFormz.dirty(tPassword),
            referralCode: tReferralCode,
            status: FormzStatus.submissionInProgress,
          ),
          const RegisterState(
            name: NameFormz.dirty(tName),
            email: EmailFormz.dirty(tEmail),
            password: PasswordFormz.dirty(tPassword),
            referralCode: tReferralCode,
            status: FormzStatus.submissionSuccess,
          ),
          const RegisterState(
            name: NameFormz.dirty(tName),
            email: EmailFormz.dirty(tEmail),
            password: PasswordFormz.dirty(tPassword),
            referralCode: tReferralCode,
            status: FormzStatus.submissionSuccess,
            complete: true,
          ),
        ],
      );
    });

    group('RegisterNameChanged', () {
      test('supports value comparisons', () {
        expect(
          RegisterNameChanged(tName),
          RegisterNameChanged(tName),
        );
      });
    });

    group('RegisterReferralCodeChanged ', () {
      test('supports value comparisons', () {
        expect(
          RegisterReferralCodeChanged(tReferralCode),
          RegisterReferralCodeChanged(tReferralCode),
        );
      });
    });
  });
}
