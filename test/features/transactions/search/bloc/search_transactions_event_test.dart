// ignore_for_file: prefer_const_constructors

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/transactions/search/bloc/search_transactions_bloc.dart';

import '../../../../constants.dart';

void main() {
  group('SearchTransactionsEvent', () {
    group('ChangeFilterSelect', () {
      test('supports value comparisons', () {
        expect(
          ChangeFilterSelect(
            select: TransactionFilterOption.receive,
            widthFilterLabel: widthFilterLabel,
          ),
          ChangeFilterSelect(
            select: TransactionFilterOption.receive,
            widthFilterLabel: widthFilterLabel,
          ),
        );
      });
    });
    group('ActiveDeactiveFilter', () {
      test('supports value comparisons', () {
        expect(
          ActiveDeactiveFilter(changeTo: TransactionFilterOption.none),
          ActiveDeactiveFilter(changeTo: TransactionFilterOption.none),
        );
      });
    });
    group('GetAllTransactions', () {
      test('supports value comparisons', () {
        expect(GetAllTransactions(), GetAllTransactions());
      });
    });

    group('CleanFilter', () {
      test('supports value comparisons', () {
        expect(CleanFilter(), CleanFilter());
      });
    });

    group('SearchTermChanged', () {
      const tSearchTerm = 'searchTerm';
      test('supports value comparisons', () {
        expect(
          SearchTermChanged(searchTerm: tSearchTerm),
          SearchTermChanged(searchTerm: tSearchTerm),
        );
      });
    });
  });
}
