import 'package:equatable/equatable.dart';

const String _kUnexpectedError = 'Ups. Something unexpected happended.';

abstract class Failure with EquatableMixin {
  const Failure({this.properties});

  final List? properties;

  @override
  String toString() => _kUnexpectedError;
  @override
  List<Object?> get props => [properties];
}

class ServerFailure extends Failure {
  const ServerFailure({this.message});
  final String? message;

  @override
  String toString() => message ?? 'Server Failure';
}

class NoInternetConnectionFailure extends Failure {
  NoInternetConnectionFailure({this.message});

  final String? message;

  @override
  String toString() => message ?? 'No Intertet connection Failure.';
}

class AuthenticationFailure extends Failure {
  AuthenticationFailure({this.message});

  final String? message;

  @override
  String toString() => message ?? 'Authentication Failure';
}

class InvalidCredentialsFailure extends Failure {
  InvalidCredentialsFailure({this.message});

  final String? message;

  @override
  String toString() => message ?? 'Invalid Credentials Failure';
}

class EmailAlreadyTakenFailure extends Failure {
  EmailAlreadyTakenFailure({this.message});

  final String? message;

  @override
  String toString() => message ?? 'Email already taken Failure';
}

class EmailNotRegisteredFailure extends Failure {
  EmailNotRegisteredFailure({this.message});

  final String? message;

  @override
  String toString() => message ?? 'Email not registered Failure';
}

class CacheFailure extends Failure {
  CacheFailure({this.message});

  final String? message;

  @override
  String toString() => message ?? 'Cache Failure';
}
