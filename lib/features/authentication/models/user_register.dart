import 'package:mobile_app/features/authentication/models/models.dart';

class UserRegister extends UserLogin {
  const UserRegister({
    required this.name,
    required String email,
    required String password,
    this.referralCode,
  }) : super(
          email: email,
          password: password,
        );

  final String name;
  final String? referralCode;

  @override
  List<Object?> get props => [name, referralCode];
}
