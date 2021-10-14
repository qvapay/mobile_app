import 'dart:async';
import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:formz/formz.dart';

import 'package:mobile_app/authentication/authentication.dart';
import 'package:mobile_app/core/error/failures.dart';
import 'package:mobile_app/core/formz/formz.dart';

part 'login_event.dart';
part 'login_state.dart';

class LoginBloc extends Bloc<LoginEvent, LoginState> {
  LoginBloc({required IAuthenticationRepository authenticationRepository})
      : _authenticationRepository = authenticationRepository,
        super(const LoginState()) {
    on<LoginEmailChanged>(_onEmailChanged);
    on<LoginPasswordChanged>(_onPasswordChanged);
    on<LoginSubmitted>(_onSubmitted);
  }

  final IAuthenticationRepository _authenticationRepository;

  void _onEmailChanged(
    LoginEmailChanged event,
    Emitter<LoginState> emit,
  ) {
    final email = EmailFormz.dirty(event.email);
    emit(state.copyWith(
      email: email,
      status: Formz.validate([state.password, email]),
    ));
  }

  void _onPasswordChanged(
    LoginPasswordChanged event,
    Emitter<LoginState> emit,
  ) {
    final password = PasswordFormz.dirty(event.password);
    emit(state.copyWith(
      password: password,
      status: Formz.validate([password, state.email]),
    ));
  }

  Future<void> _onSubmitted(
    LoginSubmitted event,
    Emitter<LoginState> emit,
  ) async {
    if (state.status.isValidated) {
      emit(state.copyWith(status: FormzStatus.submissionInProgress));

      final result = await _authenticationRepository.logIn(
        userLogin: UserLogin(
          email: state.email.value,
          password: state.password.value,
        ),
      );

      emit(result.fold(
        (faileure) => state.copyWith(
          status: FormzStatus.submissionFailure,
          messageError: (faileure as InvalidCredentialsFailure).message,
        ),
        (_) => state.copyWith(status: FormzStatus.submissionSuccess),
      ));
    }
  }
}
