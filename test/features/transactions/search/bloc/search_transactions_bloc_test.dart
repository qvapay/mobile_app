import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/features/transactions/search/bloc/search_transactions_bloc.dart';

void main() {
  group('SearchTransactionsBloc', () {
    test('initial state', () {
      expect(SearchTransactionsBloc().state, SearchTransactionsBloc().state);
    });

    group('search filter', () {
      group('active/deactive', () {
        blocTest<SearchTransactionsBloc, SearchTransactionsState>(
          'emit [isFilterActive] as `true`',
          build: () => SearchTransactionsBloc(),
          act: (bloc) => bloc.add(const ActiveDeactiveFilter()),
          expect: () => <SearchTransactionsState>[
            const SearchTransactionsState(isFilterActive: true)
          ],
        );
        blocTest<SearchTransactionsBloc, SearchTransactionsState>(
          'emit [isFilterActive] as `false`',
          build: () => SearchTransactionsBloc(),
          seed: () => const SearchTransactionsState(isFilterActive: true),
          act: (bloc) => bloc.add(const ActiveDeactiveFilter()),
          expect: () =>
              <SearchTransactionsState>[const SearchTransactionsState()],
        );
      });

      group('filterOptionSelect', () {
        blocTest<SearchTransactionsBloc, SearchTransactionsState>(
          'emit [TransactionFilterOption.all] when is selected',
          build: () => SearchTransactionsBloc(),
          seed: () => const SearchTransactionsState(
            isFilterActive: true,
            filterOptionSelect: TransactionFilterOption.receive,
          ),
          act: (bloc) => bloc.add(
              const ChangeFilterSelect(select: TransactionFilterOption.all)),
          expect: () => <SearchTransactionsState>[
            const SearchTransactionsState(isFilterActive: true)
          ],
        );

        blocTest<SearchTransactionsBloc, SearchTransactionsState>(
          'emit [TransactionFilterOption.receive] when is selected',
          build: () => SearchTransactionsBloc(),
          seed: () => const SearchTransactionsState(isFilterActive: true),
          act: (bloc) => bloc.add(const ChangeFilterSelect(
              select: TransactionFilterOption.receive)),
          expect: () => <SearchTransactionsState>[
            const SearchTransactionsState(
              isFilterActive: true,
              filterIndex: 216,
              filterOptionSelect: TransactionFilterOption.receive,
            )
          ],
        );

        blocTest<SearchTransactionsBloc, SearchTransactionsState>(
          'emit [TransactionFilterOption.send] when is selected',
          build: () => SearchTransactionsBloc(),
          seed: () => const SearchTransactionsState(isFilterActive: true),
          act: (bloc) => bloc.add(
              const ChangeFilterSelect(select: TransactionFilterOption.send)),
          expect: () => <SearchTransactionsState>[
            const SearchTransactionsState(
              isFilterActive: true,
              filterIndex: 108,
              filterOptionSelect: TransactionFilterOption.send,
            )
          ],
        );
      });
    });
  });
}
