// ignore_for_file: prefer_const_constructors

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/transactions/search/bloc/search_transactions_bloc.dart';

void main() {
  group('SearchTransactionsEvent', () {
    group('ChangeFilterSelect', () {
      test('supports value comparisons', () {
        expect(
          ChangeFilterSelect(select: TransactionFilterOption.receive),
          ChangeFilterSelect(select: TransactionFilterOption.receive),
        );
      });
    });
    group('ActiveDeactiveFilter', () {
      test('supports value comparisons', () {
        expect(ActiveDeactiveFilter(), ActiveDeactiveFilter());
      });
    });
    group('GetAllTransactions', () {
      test('supports value comparisons', () {
        expect(GetAllTransactions(), GetAllTransactions());
      });
    });
  });
}
