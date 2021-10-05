import 'package:dartz/dartz.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/authentication/models/user_login.dart';
import 'package:mobile_app/authentication/models/user_register.dart';
import 'package:mobile_app/authentication/repository/authentication_repository.dart';
import 'package:mobile_app/core/error/failures.dart';
import 'package:mocktail/mocktail.dart';
import 'package:qvapay_api_client/qvapay_api_client.dart';

class MockQvaPayApi extends Mock implements QvaPayApi {}

void main() {
  late QvaPayApi mockQvaPayApi;
  late IAuthenticationRepository authenticationRepository;

  setUp(() {
    mockQvaPayApi = MockQvaPayApi();
    authenticationRepository =
        AuthenticationRepository(qvaPayApi: mockQvaPayApi);
  });

  const mockCredential = {
    'name': 'Erich Cruz',
    'email': 'test@qvapay.com',
    'password': 'sqp',
    'referralCode': 'BacheCubano',
  };

  final tUserLogIn = UserLogin(
    email: mockCredential['email']!,
    password: mockCredential['password']!,
  );

  final tUserRegister = UserRegister(
    name: mockCredential['name']!,
    email: mockCredential['email']!,
    password: mockCredential['password']!,
    referralCode: mockCredential['referralCode']!,
  );

  group('LogIn', () {
    test('should successfully authenticate to the plataform.', () async {
      when(() => mockQvaPayApi.logIn(
            email: mockCredential['email']!,
            password: mockCredential['password']!,
          )).thenAnswer((_) async => 'token');
      when(() => mockQvaPayApi.status)
          .thenAnswer((_) => Stream.value(OAuthStatus.authenticated));

      final result =
          await authenticationRepository.logIn(userLogin: tUserLogIn);

      expect(result, const Right<Failure, Unit>(unit));
      expect(
        authenticationRepository.status,
        emitsInOrder(<OAuthStatus>[OAuthStatus.authenticated]),
      );
    });

    test(
        'should return [Left<InvalidCredentialsFailure>] when '
        'the `password` is incorrect', () async {
      when(() => mockQvaPayApi.logIn(
            email: mockCredential['email']!,
            password: mockCredential['password']!,
          )).thenThrow(AuthenticateException(error: 'Password mismatch'));
      when(() => mockQvaPayApi.status).thenAnswer((_) => const Stream.empty());

      final result =
          await authenticationRepository.logIn(userLogin: tUserLogIn);

      expect(
        result,
        Left<InvalidCredentialsFailure, Unit>(InvalidCredentialsFailure()),
      );
      // expect(
      //   result,
      //   isA<Left<InvalidCredentialsFailure, Unit>>().having(
      //     (e) => e.fold((l) => l.message, (r) => r),
      //     'password error',
      //     equals('Password mismatch'),
      //   ),
      // );
      expect(
        authenticationRepository.status,
        emitsInOrder(<OAuthStatus>[]),
      );
    });

    test(
        'should return [Left<InvalidCredentialsFailure>] when '
        'the `email` is incorrect', () async {
      when(() => mockQvaPayApi.logIn(
            email: mockCredential['email']!,
            password: mockCredential['password']!,
          )).thenThrow(AuthenticateException(error: 'User does not exist'));
      when(() => mockQvaPayApi.status).thenAnswer((_) => const Stream.empty());

      final result =
          await authenticationRepository.logIn(userLogin: tUserLogIn);

      expect(
        result,
        Left<InvalidCredentialsFailure, Unit>(InvalidCredentialsFailure()),
      );
      expect(
        authenticationRepository.status,
        emitsInOrder(<OAuthStatus>[]),
      );
    });

    test(
        'should return [Left<ServerFailure>] when '
        'an error ocurrs on the server.', () async {
      when(() => mockQvaPayApi.logIn(
            email: mockCredential['email']!,
            password: mockCredential['password']!,
          )).thenThrow(ServerException());
      when(() => mockQvaPayApi.status).thenAnswer((_) => const Stream.empty());

      final result =
          await authenticationRepository.logIn(userLogin: tUserLogIn);

      expect(
        result,
        const Left<ServerFailure, Unit>(ServerFailure()),
      );
      expect(
        authenticationRepository.status,
        emitsInOrder(<OAuthStatus>[]),
      );
    });
  });

  group('status', () {
    test('should return the authentication status.', () {
      when(() => mockQvaPayApi.status)
          .thenAnswer((_) => Stream.value(OAuthStatus.authenticated));

      expect(
        authenticationRepository.status,
        emitsInOrder(<OAuthStatus>[OAuthStatus.authenticated]),
      );
    });
    test('should return the authentication status when empty.', () {
      when(() => mockQvaPayApi.status).thenAnswer((_) => const Stream.empty());

      expect(
        authenticationRepository.status,
        emitsInOrder(<OAuthStatus>[]),
      );
    });
  });

  group('logOut', () {
    test('should return `true` when successfully logged out.', () async {
      when(() => mockQvaPayApi.logOut()).thenAnswer((_) => Future.value());

      expect(await authenticationRepository.logOut(), isTrue);
      expect(mockQvaPayApi.logOut(), completes);
    });

    test('should return `false` when an error ocurrs on the server.', () async {
      when(mockQvaPayApi.logOut).thenThrow(ServerException());

      expect(await authenticationRepository.logOut(), isFalse);
    });
  });

  group('register', () {
    test('should succefilly registeser', () async {
      when(() => mockQvaPayApi.register(
            name: mockCredential['name']!,
            email: mockCredential['email']!,
            password: mockCredential['password']!,
          )).thenAnswer((_) => Future.value());

      final result =
          await authenticationRepository.register(userRegister: tUserRegister);

      expect(result, const Right<Failure, Unit>(unit));
    });

    test(
        'should return [Left<EmailAlreadyTakenFailure>] when '
        'is already registered.', () async {
      when(() => mockQvaPayApi.register(
                name: mockCredential['name']!,
                email: mockCredential['email']!,
                password: mockCredential['password']!,
              ))
          .thenThrow(RegisterException(
              error: 'El valor del campo email ya está en uso.'));

      final result =
          await authenticationRepository.register(userRegister: tUserRegister);

      expect(
        result,
        Left<Failure, Unit>(EmailAlreadyTakenFailure(
            message: 'El valor del campo email ya está en uso.')),
      );
    });
    test(
        'should return [Left<ServerFailure>] when '
        'an error ocurrs on the server.', () async {
      when(() => mockQvaPayApi.register(
            name: mockCredential['name']!,
            email: mockCredential['email']!,
            password: mockCredential['password']!,
          )).thenThrow(ServerException());

      final result =
          await authenticationRepository.register(userRegister: tUserRegister);

      expect(
        result,
        const Left<Failure, Unit>(ServerFailure()),
      );
    });
  });
}
