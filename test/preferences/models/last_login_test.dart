import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/preferences/models/last_login.dart';

void main() {
  const tLastLogInJson = {
    'name': 'QvaPay App',
    'email': 'test@qvapay.com',
    'photoUrl': 'https://qvapay.com/icon.png',
    'date': '2021-10-04T00:00:00.000'
  };

  final tLastLogInModel = LastLogIn(
    name: 'QvaPay App',
    email: 'test@qvapay.com',
    photoUrl: 'https://qvapay.com/icon.png',
    date: DateTime.parse('2021-10-04T00:00:00.000'),
  );
  group('LastLogIn', () {
    test('fromJson', () {
      expect(tLastLogInModel, isA<LastLogIn>());
      expect(tLastLogInModel, equals(LastLogIn.fromJson(tLastLogInJson)));
    });

    test('toJson', () {
      final json = tLastLogInModel.toJson();

      expect(json, isA<Map<String, dynamic>>());
      expect(json, equals(tLastLogInJson));
    });
  });
}
