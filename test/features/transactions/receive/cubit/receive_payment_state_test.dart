import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/transactions/receive/receive.dart';

import '../../../../constants.dart';

void main() {
  group('ReceivePaymentState', () {
    test('supports value comparisons', () {
      expect(
        ReceivePaymentState(transaction: tUserTransaction),
        ReceivePaymentState(transaction: tUserTransaction),
      );
    });

    test('copyWith', () {
      expect(
        ReceivePaymentState(transaction: tUserTransaction).copyWith(),
        ReceivePaymentState(transaction: tUserTransaction).copyWith(),
      );
    });
  });
}
