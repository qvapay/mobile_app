import 'dart:async';

import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:formz/formz.dart';
import 'package:mobile_app/core/error/failures.dart';
import 'package:mobile_app/core/formz/formz.dart';
import 'package:mobile_app/features/authentication/authentication.dart';

part 'register_event.dart';
part 'register_state.dart';

class RegisterBloc extends Bloc<RegisterEvent, RegisterState> {
  RegisterBloc({required IAuthenticationRepository authenticationRepository})
      : _authenticationRepository = authenticationRepository,
        super(const RegisterState()) {
    on<RegisterNameChanged>(_onNameChanged);
    on<RegisterEmailChanged>(_onEmailChanged);
    on<RegisterPasswordChanged>(_onPasswordChanged);
    on<RegisterReferralCodeChanged>(_onReferralCodeChange);
    on<RegisterSubmitted>(_onSubmitted);
    on<RegisterCompleteChanged>(_onComplete);
  }

  final IAuthenticationRepository _authenticationRepository;

  FutureOr<void> _onNameChanged(
      RegisterNameChanged event, Emitter<RegisterState> emit) {
    final name = NameFormz.dirty(event.name);
    emit(state.copyWith(
      name: name,
      status: Formz.validate([name, state.email, state.password]),
      referralCode: state.referralCode,
    ));
  }

  FutureOr<void> _onEmailChanged(
      RegisterEmailChanged event, Emitter<RegisterState> emit) {
    final email = EmailFormz.dirty(event.email);
    emit(state.copyWith(
      email: email,
      status: Formz.validate([state.name, email, state.password]),
      referralCode: state.referralCode,
    ));
  }

  FutureOr<void> _onPasswordChanged(
      RegisterPasswordChanged event, Emitter<RegisterState> emit) {
    final password = PasswordFormz.dirty(event.password);
    emit(state.copyWith(
      password: password,
      status: Formz.validate([state.name, state.email, password]),
      referralCode: state.referralCode,
    ));
  }

  FutureOr<void> _onReferralCodeChange(
      RegisterReferralCodeChanged event, Emitter<RegisterState> emit) {
    emit(state.copyWith(referralCode: event.referralCode));
  }

  FutureOr<void> _onSubmitted(
      RegisterSubmitted event, Emitter<RegisterState> emit) async {
    if (state.status.isValidated) {
      emit(state.copyWith(status: FormzStatus.submissionInProgress));

      final result = await _authenticationRepository.register(
        userRegister: UserRegister(
          name: state.name.value,
          email: state.email.value,
          password: state.password.value,
          referralCode: state.referralCode,
        ),
      );

      emit(result.fold(
        (faileure) => state.copyWith(
          status: FormzStatus.submissionFailure,
          messageError: faileure is EmailAlreadyTakenFailure
              ? faileure.message
              : const ServerFailure().message,
        ),
        (_) => state.copyWith(status: FormzStatus.submissionSuccess),
      ));
    }
  }

  FutureOr<void> _onComplete(
    RegisterCompleteChanged event,
    Emitter<RegisterState> emit,
  ) {
    emit(state.copyWith(complete: !state.complete));
  }
}
