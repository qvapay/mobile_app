import 'package:equatable/equatable.dart';

class UserLogin extends Equatable {
  const UserLogin({required this.email, required this.password});

  final String email;
  final String password;

  @override
  List<Object?> get props => [email, password];
}
