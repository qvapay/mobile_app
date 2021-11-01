import 'package:mobile_app/features/authentication/models/models.dart';

const tName = 'Erich Garcia';
const tEmail = 'erich@qvapay';
const tPassword = 'MyPassword';
const tReferralCode = 'BACHE-CUBANO';

final tDate = DateTime.parse('2021-12-16T00:12:00.000');

const tUserRegister = UserRegister(
  name: tName,
  email: tEmail,
  password: tPassword,
  referralCode: tReferralCode,
);

const tEmailMessageError = 'El correo ya está en uso';
