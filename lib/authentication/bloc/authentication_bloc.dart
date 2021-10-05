import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile_app/authentication/repository/authentication_repository.dart';
import 'package:qvapay_api_client/qvapay_api_client.dart';

part 'authentication_event.dart';
part 'authentication_state.dart';

class AuthenticationBloc
    extends Bloc<AuthenticationEvent, AuthenticationState> {
  AuthenticationBloc({
    required IAuthenticationRepository authenticationRepository,
  })  : _authenticationRepository = authenticationRepository,
        super(const AuthenticationState.unknown()) {
    on<AuthenticationStatusChanged>(_onAuthenticationStatusChanged);
    on<AuthenticationLogoutRequested>(_onAuthenticationLogoutRequested);
    _authenticationStatusSubscription = _authenticationRepository.status.listen(
      (status) => add(AuthenticationStatusChanged(status)),
    );
  }

  final IAuthenticationRepository _authenticationRepository;
  late StreamSubscription<OAuthStatus> _authenticationStatusSubscription;

  @override
  Future<void> close() {
    _authenticationRepository.dispose();
    _authenticationStatusSubscription.cancel();
    return super.close();
  }

  FutureOr<void> _onAuthenticationStatusChanged(
    AuthenticationStatusChanged event,
    Emitter<AuthenticationState> emit,
  ) async {
    switch (event.status) {
      case OAuthStatus.unauthenticated:
        return emit(const AuthenticationState.unauthenticated());
      case OAuthStatus.authenticated:
        return emit(const AuthenticationState.authenticated());
      default:
        return emit(const AuthenticationState.unknown());
    }
  }

  FutureOr<void> _onAuthenticationLogoutRequested(
    AuthenticationLogoutRequested event,
    Emitter<AuthenticationState> emit,
  ) async {
    await _authenticationRepository.logOut();
  }
}
