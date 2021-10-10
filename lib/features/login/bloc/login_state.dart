part of 'login_bloc.dart';

class LoginState extends Equatable {
  const LoginState({
    this.status = FormzStatus.pure,
    this.email = const EmailFormz.pure(),
    this.password = const PasswordFormz.pure(),
    this.messageError = '',
  });

  final FormzStatus status;
  final EmailFormz email;
  final PasswordFormz password;
  final String messageError;

  LoginState copyWith({
    FormzStatus? status,
    EmailFormz? email,
    PasswordFormz? password,
    String? messageError,
  }) {
    return LoginState(
      status: status ?? this.status,
      email: email ?? this.email,
      password: password ?? this.password,
      messageError: messageError ?? this.messageError,
    );
  }

  @override
  List<Object> get props => [status, email, password, messageError];
}
