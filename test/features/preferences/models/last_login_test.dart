import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/preferences/preferences.dart';

void main() {
  const tDate = '2021-12-16T00:12:00.000';

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

    test('copyWith', () {
      expect(
        tLastLogInModel.copyWith(),
        equals(tLastLogInModel.copyWith()),
      );
    });
  });
}
