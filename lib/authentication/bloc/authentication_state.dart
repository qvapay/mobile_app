part of 'authentication_bloc.dart';

class AuthenticationState extends Equatable {
  const AuthenticationState._({
    this.status = OAuthStatus.unauthenticated,
    // this.user = User.empty,
  });

  const AuthenticationState.unknown() : this._();

  const AuthenticationState.authenticated()
      : this._(status: OAuthStatus.authenticated);

  const AuthenticationState.unauthenticated()
      : this._(status: OAuthStatus.unauthenticated);

  final OAuthStatus status;
  // final User user;

  @override
  List<Object> get props => [status];
}
