part of 'register_bloc.dart';

class RegisterState extends Equatable {
  const RegisterState({
    this.status = FormzStatus.pure,
    this.name = const NameFormz.pure(),
    this.email = const EmailFormz.pure(),
    this.password = const PasswordFormz.pure(),
    this.referralCode,
    this.messageError = '',
    this.complete = false,
  });

  final FormzStatus status;
  final NameFormz name;
  final EmailFormz email;
  final PasswordFormz password;
  final String? referralCode;
  final String messageError;
  final bool complete;

  RegisterState copyWith({
    FormzStatus? status,
    NameFormz? name,
    EmailFormz? email,
    PasswordFormz? password,
    String? referralCode,
    String? messageError,
    bool? complete,
  }) {
    return RegisterState(
      status: status ?? this.status,
      name: name ?? this.name,
      email: email ?? this.email,
      password: password ?? this.password,
      referralCode: referralCode ?? this.referralCode,
      messageError: messageError ?? this.messageError,
      complete: complete ?? this.complete,
    );
  }

  @override
  List<Object?> get props =>
      [status, name, email, password, referralCode, messageError, complete];
}
