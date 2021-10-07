import 'dart:async';
import 'dart:developer';

import 'package:dartz/dartz.dart';
import 'package:mobile_app/authentication/authentication.dart';
import 'package:mobile_app/core/error/failures.dart';
import 'package:qvapay_api_client/qvapay_api_client.dart';

abstract class IAuthenticationRepository {
  Future<Either<Failure, Unit>> logIn({required UserLogin userLogin});

  Future<Either<Failure, Unit>> register({
    required UserRegister userRegister,
  });

  Future<bool> logOut();

  Stream<OAuthStatus> get status;

  void dispose();
}

class AuthenticationRepository extends IAuthenticationRepository {
  AuthenticationRepository({required QvaPayApi qvaPayApi})
      : _qvaPayApi = qvaPayApi;

  final QvaPayApi _qvaPayApi;

  @override
  void dispose() {
    _qvaPayApi.dispose();
  }

  @override
  Future<Either<Failure, Unit>> logIn({required UserLogin userLogin}) async {
    try {
      await _qvaPayApi.logIn(
        email: userLogin.email,
        password: userLogin.password,
      );

      return const Right(unit);
    } catch (e) {
      log(e.toString());
      return _errorHandler(e);
    }
  }

  @override
  Future<bool> logOut() async {
    try {
      await _qvaPayApi.logOut();
      return true;
    } catch (e) {
      return false;
    }
  }

  @override
  Future<Either<Failure, Unit>> register({
    required UserRegister userRegister,
  }) async {
    try {
      await _qvaPayApi.register(
        name: userRegister.name,
        email: userRegister.email,
        password: userRegister.password,
      );
      return const Right(unit);
    } catch (e) {
      return _errorHandler(e);
    }
  }

  @override
  Stream<OAuthStatus> get status => _qvaPayApi.status;

  Left<Failure, Unit> _errorHandler(Object e) {
    if (e is AuthenticateException) {
      if (e.error != null) {
        return Left(InvalidCredentialsFailure(message: e.error!));
      }
      return Left(InvalidCredentialsFailure());
    }
    if (e is RegisterException) {
      if (e.error != null) {
        return Left(EmailAlreadyTakenFailure(message: e.error!));
      }
      return Left(EmailAlreadyTakenFailure());
    }
    return const Left(ServerFailure());
  }
}
