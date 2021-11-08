import 'package:mobile_app/features/authentication/models/models.dart';
import 'package:mobile_app/features/user_data/models/models.dart';

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

final tUserTransaction = UserTransaction(
  uuid: 'bca7b064-adbb-4b62-b3a4-3073b3e75781',
  amount: '10.00',
  name: 'Natasha Tenorio',
  description: 'AUTO_RECARGA',
  email: 'natasha@gmail.com',
  date: DateTime.parse('2021-08-28 21:41:41.000Z'),
  imageUrl: 'https://qvapay.com/logo.png',
  transactionType: TransactionType.autoRecharge,
);

const tEmailMessageError = 'El correo ya está en uso';
