import 'dart:convert';

import 'package:bloc_test/bloc_test.dart';
import 'package:dartz/dartz.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/error/failures.dart';
import 'package:mobile_app/core/formz/formz.dart';
import 'package:mobile_app/features/transactions/transactions.dart';
import 'package:mobile_app/features/user_data/models/models.dart';
import 'package:mocktail/mocktail.dart';

import '../../../../fixtures/fixture_adapter.dart';

class MockTransactionsRepository extends Mock
    implements ITransactionsRepository {}

void main() {
  late ITransactionsRepository mockTransactionsRepository;

  setUp(() {
    mockTransactionsRepository = MockTransactionsRepository();
  });

  const tSearchTerm = 'tSearchParam';

  final tTransactionListJson =
      json.decode(fixture('user_transactions.json')) as List<dynamic>;
  final tUserTransactionListJson =
      tTransactionListJson.cast<Map<String, dynamic>>();

  final tUserTransactionList = tUserTransactionListJson
      .map((t) => UserTransaction.fromJson(t))
      .map((e) => e.copyWith(amount: e.amount == '10.00' ? '-10.00' : e.amount))
      .toList();

  final tFilterSendTransactions = tUserTransactionList
      .where((element) => element.amount == '-10.00')
      .toList();

  final tFilterReceivedTransactions = tUserTransactionList
      .where((element) => element.amount != '-10.00')
      .toList();

  group('SearchTransactionsBloc', () {
    test('initial state', () {
      expect(
          SearchTransactionsBloc(
            transactionRepository: mockTransactionsRepository,
          ).state,
          SearchTransactionsBloc(
            transactionRepository: mockTransactionsRepository,
          ).state);
    });

    group('search filter', () {
      group('active/deactive', () {
        blocTest<SearchTransactionsBloc, SearchTransactionsState>(
          'emit [isFilterActive] as `true`',
          build: () => SearchTransactionsBloc(
            transactionRepository: mockTransactionsRepository,
          ),
          act: (bloc) => bloc.add(const ActiveDeactiveFilter()),
          expect: () => <SearchTransactionsState>[
            const SearchTransactionsState(isFilterActive: true)
          ],
        );
        blocTest<SearchTransactionsBloc, SearchTransactionsState>(
          'emit [isFilterActive] as `false`',
          build: () => SearchTransactionsBloc(
            transactionRepository: mockTransactionsRepository,
          ),
          seed: () => const SearchTransactionsState(isFilterActive: true),
          act: (bloc) => bloc.add(const ActiveDeactiveFilter()),
          expect: () =>
              <SearchTransactionsState>[const SearchTransactionsState()],
        );
      });

      group('filterOptionSelect', () {
        blocTest<SearchTransactionsBloc, SearchTransactionsState>(
          'emit [TransactionFilterOption.all] when is selected',
          build: () => SearchTransactionsBloc(
            transactionRepository: mockTransactionsRepository,
          ),
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
          build: () => SearchTransactionsBloc(
            transactionRepository: mockTransactionsRepository,
          ),
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
          build: () => SearchTransactionsBloc(
            transactionRepository: mockTransactionsRepository,
          ),
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

    group('search transactions', () {
      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emits a list of `UserTransaction` when actived the filter',
        setUp: () {
          when(() => mockTransactionsRepository.getLatestTransactions())
              .thenAnswer((_) async => Right(tUserTransactionList));
        },
        build: () => SearchTransactionsBloc(
          transactionRepository: mockTransactionsRepository,
        ),
        seed: () => SearchTransactionsState(transactions: tUserTransactionList),
        act: (bloc) => bloc..add(const ActiveDeactiveFilter()),
        expect: () => <SearchTransactionsState>[
          SearchTransactionsState(
            isFilterActive: true,
            transactions: tUserTransactionList,
          ),
        ],
      );

      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emits a list of `UserTransaction` filtered '
        'by [TransactionFilterOption.send]',
        setUp: () {
          when(() => mockTransactionsRepository.getLatestTransactions())
              .thenAnswer((_) async => Right(tUserTransactionList));
        },
        build: () => SearchTransactionsBloc(
          transactionRepository: mockTransactionsRepository,
        ),
        act: (bloc) => bloc
          ..add(const GetAllTransactions())
          ..add(const ActiveDeactiveFilter())
          ..add(const ChangeFilterSelect(select: TransactionFilterOption.send)),
        expect: () => <SearchTransactionsState>[
          const SearchTransactionsState(isSearchTransactions: true),
          SearchTransactionsState(transactions: tUserTransactionList),
          SearchTransactionsState(
            transactions: tUserTransactionList,
            isFilterActive: true,
          ),
          SearchTransactionsState(
            isFilterActive: true,
            filterOptionSelect: TransactionFilterOption.send,
            filterIndex: 108,
            transactions: tFilterSendTransactions,
          ),
        ],
      );

      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emits a list of `UserTransaction` filtered '
        'by [TransactionFilterOption.receive]',
        setUp: () {
          when(() => mockTransactionsRepository.getLatestTransactions())
              .thenAnswer((_) async => Right(tUserTransactionList));
        },
        build: () => SearchTransactionsBloc(
          transactionRepository: mockTransactionsRepository,
        ),
        act: (bloc) => bloc
          ..add(const GetAllTransactions())
          ..add(const ActiveDeactiveFilter())
          ..add(const ChangeFilterSelect(
              select: TransactionFilterOption.receive)),
        expect: () => <SearchTransactionsState>[
          const SearchTransactionsState(isSearchTransactions: true),
          SearchTransactionsState(transactions: tUserTransactionList),
          SearchTransactionsState(
            transactions: tUserTransactionList,
            isFilterActive: true,
          ),
          SearchTransactionsState(
            isFilterActive: true,
            filterOptionSelect: TransactionFilterOption.receive,
            filterIndex: 216,
            transactions: tFilterReceivedTransactions,
          ),
        ],
      );
    });

    group('GetAllTransactions', () {
      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emits a list of `UserTransaction` when `GetAllTransactions` is added.',
        setUp: () {
          when(() => mockTransactionsRepository.getLatestTransactions())
              .thenAnswer((_) async => Right(tUserTransactionList));
        },
        build: () => SearchTransactionsBloc(
          transactionRepository: mockTransactionsRepository,
        ),
        act: (bloc) => bloc.add(const GetAllTransactions()),
        expect: () => <SearchTransactionsState>[
          const SearchTransactionsState(isSearchTransactions: true),
          SearchTransactionsState(transactions: tUserTransactionList),
        ],
      );
      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emits `errorMessage` when `GetAllTransactions` is added '
        'an error occurs',
        setUp: () {
          when(() => mockTransactionsRepository.getLatestTransactions())
              .thenAnswer((_) async => const Left(ServerFailure()));
        },
        build: () => SearchTransactionsBloc(
          transactionRepository: mockTransactionsRepository,
        ),
        act: (bloc) => bloc.add(const GetAllTransactions()),
        expect: () => const <SearchTransactionsState>[
          SearchTransactionsState(isSearchTransactions: true),
          SearchTransactionsState(errorMessage: 'Server Failure'),
        ],
      );
    });

    group('SearchTermChanged', () {
      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emits a list of `UserTransaction` when `SearchTermChanged` is added',
        setUp: () {
          when(() => mockTransactionsRepository.getLatestTransactions(
                searchTerm: tSearchTerm,
              )).thenAnswer((_) async => Right(tFilterSendTransactions));
        },
        build: () => SearchTransactionsBloc(
          transactionRepository: mockTransactionsRepository,
        ),
        seed: () => SearchTransactionsState(transactions: tUserTransactionList),
        act: (bloc) =>
            bloc.add(const SearchTermChanged(searchTerm: tSearchTerm)),
        wait: SearchTransactionsBloc.debounceSearchTermDuration,
        expect: () => <SearchTransactionsState>[
          SearchTransactionsState(
            isSearchTransactions: true,
            transactions: tUserTransactionList,
            searchTerm: const NameFormz.dirty(tSearchTerm),
          ),
          SearchTransactionsState(
            transactions: tFilterSendTransactions,
            searchTerm: const NameFormz.dirty(tSearchTerm),
          ),
        ],
      );

      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emits `errorMessage` when error occurs',
        setUp: () {
          when(() => mockTransactionsRepository.getLatestTransactions(
                searchTerm: tSearchTerm,
              )).thenAnswer((_) async => const Left(ServerFailure()));
        },
        build: () => SearchTransactionsBloc(
          transactionRepository: mockTransactionsRepository,
        ),
        seed: () => SearchTransactionsState(transactions: tUserTransactionList),
        act: (bloc) =>
            bloc.add(const SearchTermChanged(searchTerm: tSearchTerm)),
        wait: SearchTransactionsBloc.debounceSearchTermDuration,
        expect: () => <SearchTransactionsState>[
          SearchTransactionsState(
            isSearchTransactions: true,
            transactions: tUserTransactionList,
            searchTerm: const NameFormz.dirty(tSearchTerm),
          ),
          SearchTransactionsState(
            transactions: tUserTransactionList,
            searchTerm: const NameFormz.dirty(tSearchTerm),
            errorMessage: 'Server Failure',
          ),
        ],
      );

      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emits state with pure `searchTerm` when [CleanFilter] is added.',
        build: () => SearchTransactionsBloc(
          transactionRepository: mockTransactionsRepository,
        ),
        seed: () => const SearchTransactionsState(
          searchTerm: NameFormz.dirty(tSearchTerm),
        ),
        act: (bloc) => bloc.add(const CleanFilter()),
        expect: () =>
            const <SearchTransactionsState>[SearchTransactionsState()],
      );
    });
  });
}
