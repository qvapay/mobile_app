import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/user_data/models/models.dart';
import 'package:qvapay_api_client/qvapay_api_client.dart';

import '../../../fixtures/fixture_adapter.dart';

void main() {
  final tUserDataJson =
      json.decode(fixture('user_data.json')) as Map<String, dynamic>;
  group('UserData', () {
    final tUserDataModel = UserData.fromJson(tUserDataJson);
    test('fromJson', () {
      expect(tUserDataModel, isA<UserData>());
      expect(
        tUserDataModel,
        equals(UserData.fromJson(tUserDataJson)),
      );
    });

    test('fromMe', () {
      final tMeJson = json.decode(fixture('me.json')) as Map<String, dynamic>;
      expect(
        tUserDataModel,
        equals(UserData.fromMe(Me.fromJson(tMeJson))),
      );
    });

    test('toJson', () {
      expect(tUserDataModel.toJson(), isA<Map<String, dynamic>>());
      expect(tUserDataModel.toJson(), equals(tUserDataJson));
    });

    test('copyWith', () {
      expect(
          tUserDataModel.copyWith(
            telegramUserName: '@natasha',
            address: 'Centro Habana',
            phoneNumber: '+53599999',
          ),
          equals(
            tUserDataModel.copyWith(
              telegramUserName: '@natasha',
              address: 'Centro Habana',
              phoneNumber: '+53599999',
            ),
          ));
    });
  });
}
