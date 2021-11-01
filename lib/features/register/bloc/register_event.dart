part of 'register_bloc.dart';

abstract class RegisterEvent extends Equatable {
  const RegisterEvent();
}

class RegisterSubmitted extends RegisterEvent {
  const RegisterSubmitted();

  @override
  List<Object> get props => [];
}

class RegisterNameChanged extends RegisterEvent {
  const RegisterNameChanged(this.name);

  final String name;

  @override
  List<Object> get props => [name];
}

class RegisterEmailChanged extends RegisterEvent {
  const RegisterEmailChanged(this.email);

  final String email;

  @override
  List<Object> get props => [email];
}

class RegisterPasswordChanged extends RegisterEvent {
  const RegisterPasswordChanged(this.password);

  final String password;

  @override
  List<Object> get props => [password];
}

class RegisterReferralCodeChanged extends RegisterEvent {
  const RegisterReferralCodeChanged(this.referralCode);

  final String? referralCode;

  @override
  List<Object?> get props => [referralCode];
}

class RegisterCompleteChanged extends RegisterEvent {
  const RegisterCompleteChanged();

  @override
  List<Object?> get props => [];
}
