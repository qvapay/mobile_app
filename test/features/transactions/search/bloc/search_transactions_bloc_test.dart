import 'dart:convert';

import 'package:bloc_test/bloc_test.dart';
import 'package:dartz/dartz.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/error/failures.dart';
import 'package:mobile_app/core/formz/formz.dart';
import 'package:mobile_app/features/transactions/transactions.dart';
import 'package:mobile_app/features/user_data/models/models.dart';
import 'package:mocktail/mocktail.dart';

import '../../../../constants.dart';
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

    group('filterOptionSelect', () {
      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emit [filterOptionSelect] as `TransactionFilterOption.all` when '
        'is active',
        build: () => SearchTransactionsBloc(
          transactionRepository: mockTransactionsRepository,
        ),
        seed: () => const SearchTransactionsState(),
        act: (bloc) => bloc.add(const ActiveDeactiveFilter(
          changeTo: TransactionFilterOption.all,
        )),
        expect: () => <SearchTransactionsState>[
          const SearchTransactionsState(
            filterOptionSelect: TransactionFilterOption.all,
          )
        ],
      );

      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emit [filterOptionSelect] as `TransactionFilterOption.none` when '
        'is not active',
        build: () => SearchTransactionsBloc(
          transactionRepository: mockTransactionsRepository,
        ),
        seed: () => const SearchTransactionsState(
          filterOptionSelect: TransactionFilterOption.all,
        ),
        act: (bloc) => bloc.add(const ActiveDeactiveFilter(
          changeTo: TransactionFilterOption.none,
        )),
        expect: () =>
            <SearchTransactionsState>[const SearchTransactionsState()],
      );
      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emit [TransactionFilterOption.all] when is selected',
        build: () => SearchTransactionsBloc(
          transactionRepository: mockTransactionsRepository,
        ),
        seed: () => const SearchTransactionsState(
          filterOptionSelect: TransactionFilterOption.receive,
        ),
        act: (bloc) => bloc.add(
          const ChangeFilterSelect(
            select: TransactionFilterOption.all,
            widthFilterLabel: widthFilterLabel,
          ),
        ),
        expect: () => <SearchTransactionsState>[
          const SearchTransactionsState(
            filterOptionSelect: TransactionFilterOption.all,
          )
        ],
      );

      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emit [TransactionFilterOption.receive] when is selected',
        build: () => SearchTransactionsBloc(
          transactionRepository: mockTransactionsRepository,
        ),
        seed: () => const SearchTransactionsState(
          filterOptionSelect: TransactionFilterOption.all,
        ),
        act: (bloc) => bloc.add(
          const ChangeFilterSelect(
            select: TransactionFilterOption.receive,
            widthFilterLabel: widthFilterLabel,
          ),
        ),
        expect: () => <SearchTransactionsState>[
          const SearchTransactionsState(
            filterIndex: 200,
            filterOptionSelect: TransactionFilterOption.receive,
          )
        ],
      );

      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emit [TransactionFilterOption.send] when is selected',
        build: () => SearchTransactionsBloc(
          transactionRepository: mockTransactionsRepository,
        ),
        seed: () => const SearchTransactionsState(
          filterOptionSelect: TransactionFilterOption.all,
        ),
        act: (bloc) => bloc.add(
          const ChangeFilterSelect(
            select: TransactionFilterOption.send,
            widthFilterLabel: widthFilterLabel,
          ),
        ),
        expect: () => <SearchTransactionsState>[
          const SearchTransactionsState(
            filterIndex: 100,
            filterOptionSelect: TransactionFilterOption.send,
          )
        ],
      );
      // });
      // });

      // group('search transactions', () {
      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emit a list of `UserTransaction` when actived the filter',
        setUp: () {
          when(() => mockTransactionsRepository.getLatestTransactions())
              .thenAnswer((_) async => Right(tUserTransactionList));
        },
        build: () => SearchTransactionsBloc(
          transactionRepository: mockTransactionsRepository,
        ),
        seed: () => SearchTransactionsState(transactions: tUserTransactionList),
        act: (bloc) => bloc
          ..add(
            const ActiveDeactiveFilter(changeTo: TransactionFilterOption.all),
          ),
        expect: () => <SearchTransactionsState>[
          SearchTransactionsState(
            filterOptionSelect: TransactionFilterOption.all,
            transactions: tUserTransactionList,
          ),
        ],
      );

      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emit a list of `UserTransaction` filtered '
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
          ..add(
              const ActiveDeactiveFilter(changeTo: TransactionFilterOption.all))
          ..add(const ChangeFilterSelect(
            select: TransactionFilterOption.send,
            widthFilterLabel: widthFilterLabel,
          )),
        expect: () => <SearchTransactionsState>[
          const SearchTransactionsState(isSearchTransactions: true),
          SearchTransactionsState(transactions: tUserTransactionList),
          SearchTransactionsState(
            transactions: tUserTransactionList,
            filterOptionSelect: TransactionFilterOption.all,
          ),
          SearchTransactionsState(
            transactions: tFilterSendTransactions,
            filterIndex: 100,
            filterOptionSelect: TransactionFilterOption.send,
          ),
        ],
      );

      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emit a list of `UserTransaction` filtered '
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
          ..add(
              const ActiveDeactiveFilter(changeTo: TransactionFilterOption.all))
          ..add(const ChangeFilterSelect(
            select: TransactionFilterOption.receive,
            widthFilterLabel: widthFilterLabel,
          )),
        expect: () => <SearchTransactionsState>[
          const SearchTransactionsState(isSearchTransactions: true),
          SearchTransactionsState(transactions: tUserTransactionList),
          SearchTransactionsState(
            transactions: tUserTransactionList,
            filterOptionSelect: TransactionFilterOption.all,
          ),
          SearchTransactionsState(
            filterOptionSelect: TransactionFilterOption.receive,
            filterIndex: 200,
            transactions: tFilterReceivedTransactions,
          ),
        ],
      );
    });

    group('GetAllTransactions', () {
      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emit a list of `UserTransaction` when `GetAllTransactions` is added.',
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
        'emit `errorMessage` when `GetAllTransactions` is added '
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
        'emit a list of `UserTransaction` when `SearchTermChanged` is added',
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
        'emit `errorMessage` when error occurs',
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
        'emit state with pure `searchTerm` when [CleanFilter] is added.',
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
