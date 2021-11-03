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

    group('fromMe', () {
      test('the `Me` json', () {
        final tMeJson = json.decode(fixture('me.json')) as Map<String, dynamic>;
        expect(
          tUserDataModel,
          equals(UserData.fromMe(Me.fromJson(tMeJson))),
        );
      });
      test('when `latestTransactions` in `Me` json is null', () {
        final tMeJson = json.decode(fixture('me_empty_transactions.json'))
            as Map<String, dynamic>;
        expect(
          tUserDataModel.copyWith(latestTransactions: []),
          equals(UserData.fromMe(Me.fromJson(tMeJson))),
        );
      });
    });

    test('toJson', () {
      expect(tUserDataModel.toJson(), isA<Map<String, dynamic>>());
      expect(tUserDataModel.toJson(), equals(tUserDataJson));
    });

    test('copyWith', () {
      expect(tUserDataModel.copyWith(), equals(tUserDataModel.copyWith()));
    });

    group('nameAndLastName ', () {
      test('when `lastName` is empty ', () {
        expect(tUserDataModel.nameAndLastName, equals('Natasha Tenorio'));
      });

      test('when `lastName` is not empty ', () {
        expect(
            tUserDataModel
                .copyWith(name: 'Natasha', lastName: 'Tenorio')
                .nameAndLastName,
            equals('Natasha Tenorio'));
      });
    });
  });
}
