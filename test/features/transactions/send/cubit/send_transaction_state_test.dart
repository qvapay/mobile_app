import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/transactions/transactions.dart';

void main() {
  group('SendTransactionState', () {
    test('supports value comparisons', () {
      expect(const SendTransactionState(), const SendTransactionState());
    });

    test('copyWith', () {
      expect(
        const SendTransactionState().copyWith(),
        const SendTransactionState().copyWith(),
      );
    });
  });
}
