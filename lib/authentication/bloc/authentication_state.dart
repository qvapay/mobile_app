part of 'authentication_bloc.dart';

class AuthenticationState extends Equatable {
  const AuthenticationState._({
    this.status = OAuthStatus.unauthenticated,
  });

  const AuthenticationState.unknown() : this._();

  const AuthenticationState.authenticated()
      : this._(status: OAuthStatus.authenticated);

  const AuthenticationState.unauthenticated()
      : this._(status: OAuthStatus.unauthenticated);

  final OAuthStatus status;

  @override
  List<Object> get props => [status];
}
