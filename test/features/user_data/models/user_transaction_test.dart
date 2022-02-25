import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/user_data/models/models.dart';
import 'package:qvapay_api_client/qvapay_api_client.dart';

import '../../../fixtures/fixture_adapter.dart';

void main() {
  final tUserTransactionString = fixture('user_transactions.json');
  final tTransactionListJson =
      json.decode(tUserTransactionString) as List<dynamic>;
  final tUserTransactionListJson =
      tTransactionListJson.cast<Map<String, dynamic>>();
  final tUserTransactionModel =
      UserTransaction.fromJson(tUserTransactionListJson[0]);
  group('UserTransaction', () {
    test('fromJson', () {
      expect(tUserTransactionModel, isA<UserTransaction>());
      expect(
        tUserTransactionModel,
        equals(UserTransaction.fromJson(tUserTransactionListJson[0])),
      );
    });

    test('toJson', () {
      expect(tUserTransactionModel.toJson(), isA<Map<String, dynamic>>());
      expect(
        tUserTransactionModel.toJson(),
        equals(tUserTransactionListJson[0]),
      );
    });

    group('fromTransaction', () {
      final tMeJson = json.decode(fixture('me.json')) as Map<String, dynamic>;
      final tTransactionQvaPayList = Me.fromJson(tMeJson).latestTransactions!;

      test('when the [Transaction] is of the `autoRecharge` type', () {
        final tUserTransactionModel =
            UserTransaction.fromJson(tUserTransactionListJson[0]);

        expect(tUserTransactionModel, isA<UserTransaction>());
        expect(
          tUserTransactionModel,
          equals(UserTransaction.fromTransaction(tTransactionQvaPayList[0])),
        );
      });

      test('when the [Transaction] is of the `tranfer` type', () {
        final tUserTransactionModel =
            UserTransaction.fromJson(tUserTransactionListJson[1]);

        expect(tUserTransactionModel, isA<UserTransaction>());
        expect(
          tUserTransactionModel,
          equals(UserTransaction.fromTransaction(tTransactionQvaPayList[1])),
        );
      });
      test('when the [Transaction] is of the `service` type', () {
        final tUserTransactionModel =
            UserTransaction.fromJson(tUserTransactionListJson[2]);

        expect(tUserTransactionModel, isA<UserTransaction>());
        expect(
          tUserTransactionModel,
          equals(UserTransaction.fromTransaction(tTransactionQvaPayList[2])),
        );
      });
      test('when the [Transaction] is of the `p2p` type', () {
        final tUserTransactionModel =
            UserTransaction.fromJson(tUserTransactionListJson[3]);

        expect(tUserTransactionModel, isA<UserTransaction>());
        expect(
          tUserTransactionModel,
          equals(UserTransaction.fromTransaction(tTransactionQvaPayList[3])),
        );
      });
    });

    group('typeToString', () {
      test('when is `autoRecharge` type', () {
        final tUserTransactionModel =
            UserTransaction.fromJson(tUserTransactionListJson[0]);

        expect(
          tUserTransactionModel.typeToString,
          equals('Auto Recarga'),
        );
      });

      test('when is `tranfer` type', () {
        final tUserTransactionModel =
            UserTransaction.fromJson(tUserTransactionListJson[1]);

        expect(
          tUserTransactionModel.typeToString,
          equals('Tranferencia'),
        );
      });
      test('when is `service` type', () {
        final tUserTransactionModel =
            UserTransaction.fromJson(tUserTransactionListJson[2]);

        expect(
          tUserTransactionModel.typeToString,
          equals('Servicio'),
        );
      });
      test('when is `p2p` type', () {
        final tUserTransactionModel =
            UserTransaction.fromJson(tUserTransactionListJson[3]);

        expect(
          tUserTransactionModel.typeToString,
          equals('P2P'),
        );
      });
    });

    test('dencode/encode', () {
      expect(
        tUserTransactionModel,
        equals(UserTransaction.decode(tUserTransactionModel.encode())),
      );
    });
    test('smallUuid', () {
      expect(
        '3073b3e75781',
        equals(tUserTransactionModel.smallUuid),
      );
    });

    test('copyWith', () {
      expect(
        tUserTransactionModel.copyWith(),
        tUserTransactionModel.copyWith(),
      );
    });
  });
}
