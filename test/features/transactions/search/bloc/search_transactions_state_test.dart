import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/transactions/search/search.dart';

void main() {
  group('SearchTransactionsState', () {
    test('supports value comparisons', () {
      expect(const SearchTransactionsState(), const SearchTransactionsState());
    });

    test('copyWith', () {
      expect(
        const SearchTransactionsState().copyWith(),
        const SearchTransactionsState().copyWith(),
      );
    });
  });
}
