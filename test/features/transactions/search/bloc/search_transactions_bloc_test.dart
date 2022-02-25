import 'dart:convert';

import 'package:bloc_test/bloc_test.dart';
import 'package:dartz/dartz.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:formz/formz.dart';
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

  setUp(() {
    mockTransactionsRepository = MockTransactionsRepository();
    when(() => mockTransactionsRepository.getLatestTransactions())
        .thenAnswer((_) async => Right(tUserTransactionList));
  });

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

    group('ChangeFilterSelect', () {
      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emit [TransactionFilterOption.all] when is selected',
        build: () => SearchTransactionsBloc(
          transactionRepository: mockTransactionsRepository,
        ),
        seed: () => const SearchTransactionsState(
          filterOptionSelect: TransactionFilterOption.receive,
          filterIndex: widthFilterLabel,
        ),
        act: (bloc) => bloc.add(
          const ChangeFilterSelect(
            select: TransactionFilterOption.all,
            widthFilterLabel: 0,
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
            filterIndex: widthFilterLabel,
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
          ..add(const ActiveDeactiveFilter())
          ..add(const ChangeFilterSelect(
            select: TransactionFilterOption.send,
            widthFilterLabel: widthFilterLabel,
          )),
        expect: () => <SearchTransactionsState>[
          const SearchTransactionsState(
            status: FormzStatus.submissionInProgress,
          ),
          SearchTransactionsState(
            status: FormzStatus.submissionSuccess,
            transactions: tUserTransactionList,
          ),
          SearchTransactionsState(
            status: FormzStatus.submissionSuccess,
            transactions: tUserTransactionList,
            filterOptionSelect: TransactionFilterOption.all,
          ),
          SearchTransactionsState(
            status: FormzStatus.submissionSuccess,
            transactions: tFilterSendTransactions,
            filterIndex: widthFilterLabel,
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
        skip: 2,
        act: (bloc) => bloc
          ..add(const GetAllTransactions())
          ..add(const ActiveDeactiveFilter())
          ..add(const ChangeFilterSelect(
            select: TransactionFilterOption.receive,
            widthFilterLabel: widthFilterLabel,
          )),
        expect: () => <SearchTransactionsState>[
          SearchTransactionsState(
            status: FormzStatus.submissionSuccess,
            transactions: tUserTransactionList,
            filterOptionSelect: TransactionFilterOption.all,
          ),
          SearchTransactionsState(
            status: FormzStatus.submissionSuccess,
            filterOptionSelect: TransactionFilterOption.receive,
            filterIndex: widthFilterLabel,
            transactions: tFilterReceivedTransactions,
          ),
        ],
      );

      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emit a list of `UserTransaction` filtered '
        'by [TransactionFilterOption.all]',
        setUp: () {
          when(() => mockTransactionsRepository.getLatestTransactions())
              .thenAnswer((_) async => Right(tUserTransactionList));
        },
        build: () => SearchTransactionsBloc(
          transactionRepository: mockTransactionsRepository,
        ),
        skip: 2,
        act: (bloc) => bloc
          ..add(const GetAllTransactions())
          ..add(const ActiveDeactiveFilter())
          ..add(const ChangeFilterSelect(
            select: TransactionFilterOption.receive,
            widthFilterLabel: widthFilterLabel,
          ))
          ..add(const ChangeFilterSelect(
            select: TransactionFilterOption.all,
            widthFilterLabel: 0,
          )),
        expect: () => <SearchTransactionsState>[
          SearchTransactionsState(
            status: FormzStatus.submissionSuccess,
            transactions: tUserTransactionList,
            filterOptionSelect: TransactionFilterOption.all,
          ),
          SearchTransactionsState(
            status: FormzStatus.submissionSuccess,
            filterOptionSelect: TransactionFilterOption.receive,
            filterIndex: widthFilterLabel,
            transactions: tFilterReceivedTransactions,
          ),
          SearchTransactionsState(
            status: FormzStatus.submissionSuccess,
            filterOptionSelect: TransactionFilterOption.all,
            transactions: tUserTransactionList,
          ),
        ],
      );

      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emits [MyState] when MyEvent is added.',
        build: () => SearchTransactionsBloc(
          transactionRepository: mockTransactionsRepository,
        ),
        act: (bloc) => bloc.add(const ChangeFilterSelect(
          select: TransactionFilterOption.none,
          widthFilterLabel: widthFilterLabel,
        )),
        expect: () => const <SearchTransactionsState>[],
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
          const SearchTransactionsState(
            status: FormzStatus.submissionInProgress,
          ),
          SearchTransactionsState(
            status: FormzStatus.submissionSuccess,
            transactions: tUserTransactionList,
          ),
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
          SearchTransactionsState(status: FormzStatus.submissionInProgress),
          SearchTransactionsState(
            status: FormzStatus.submissionFailure,
            errorMessage: 'Server Failure',
          ),
        ],
      );
    });

    group('ActiveDeactiveFilter', () {
      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emit [filterOptionSelect] as `TransactionFilterOption.all` when '
        'is active',
        build: () => SearchTransactionsBloc(
          transactionRepository: mockTransactionsRepository,
        ),
        seed: () => const SearchTransactionsState(),
        act: (bloc) => bloc.add(const ActiveDeactiveFilter()),
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
        act: (bloc) => bloc.add(const ActiveDeactiveFilter()),
        expect: () =>
            <SearchTransactionsState>[const SearchTransactionsState()],
      );
      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emits [filterOptionSelect] equal to TransactionFilterOption.all '
        'when filter is inactive and `searchTerm` is pure.',
        build: () => SearchTransactionsBloc(
          transactionRepository: mockTransactionsRepository,
        ),
        act: (bloc) => bloc.add(const ActiveDeactiveFilter()),
        expect: () => <SearchTransactionsState>[
          const SearchTransactionsState(
            filterOptionSelect: TransactionFilterOption.all,
          ),
        ],
      );

      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emits [filterOptionSelect] equal to TransactionFilterOption.none '
        'when filter is active and `searchTerm` is drity.',
        setUp: () {
          when(
            () => mockTransactionsRepository.getLatestTransactions(
              searchTerm: tSearchTerm,
            ),
          ).thenAnswer((_) async => Right(tUserTransactionList));
        },
        build: () => SearchTransactionsBloc(
          transactionRepository: mockTransactionsRepository,
        ),
        skip: 3,
        act: (bloc) => bloc
          ..add(const GetAllTransactions())
          ..add(const ActiveDeactiveFilter())
          ..add(const SearchTermChanged(searchTerm: tSearchTerm))
          ..add(const ActiveDeactiveFilter()),
        expect: () => <SearchTransactionsState>[
          SearchTransactionsState(
            status: FormzStatus.submissionInProgress,
            transactions: tUserTransactionList,
            filterOptionSelect: TransactionFilterOption.all,
            searchTerm: const NameFormz.dirty(tSearchTerm),
          ),
          SearchTransactionsState(
            status: FormzStatus.submissionSuccess,
            transactions: tUserTransactionList,
            filterOptionSelect: TransactionFilterOption.all,
            searchTerm: const NameFormz.dirty(tSearchTerm),
          ),
          // change filter to inactived
          SearchTransactionsState(
            status: FormzStatus.submissionSuccess,
            transactions: tUserTransactionList,
            searchTerm: const NameFormz.dirty(tSearchTerm),
          ),
        ],
      );

      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emits [filterOptionSelect] equal to TransactionFilterOption.none '
        'when the filter is active in `TransactionFilterOption.send` ',
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
            select: TransactionFilterOption.send,
            widthFilterLabel: widthFilterLabel,
          ))
          ..add(const ActiveDeactiveFilter()),
        expect: () => <SearchTransactionsState>[
          const SearchTransactionsState(
            status: FormzStatus.submissionInProgress,
          ),
          SearchTransactionsState(
            status: FormzStatus.submissionSuccess,
            transactions: tUserTransactionList,
          ),
          SearchTransactionsState(
            status: FormzStatus.submissionSuccess,
            transactions: tUserTransactionList,
            filterOptionSelect: TransactionFilterOption.all,
          ),
          SearchTransactionsState(
            status: FormzStatus.submissionSuccess,
            transactions: tFilterSendTransactions,
            filterOptionSelect: TransactionFilterOption.send,
            filterIndex: widthFilterLabel,
          ),
          SearchTransactionsState(
            status: FormzStatus.submissionSuccess,
            transactions: tUserTransactionList,
          ),
        ],
      );
      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emits [filterOptionSelect] equal to TransactionFilterOption.none '
        'when the filter is active in `TransactionFilterOption.receive` ',
        setUp: () {
          when(() => mockTransactionsRepository.getLatestTransactions())
              .thenAnswer((_) async => Right(tUserTransactionList));
        },
        build: () => SearchTransactionsBloc(
          transactionRepository: mockTransactionsRepository,
        ),
        skip: 3,
        act: (bloc) => bloc
          ..add(const GetAllTransactions())
          ..add(const ActiveDeactiveFilter())
          ..add(const ChangeFilterSelect(
            select: TransactionFilterOption.receive,
            widthFilterLabel: widthFilterLabel,
          ))
          ..add(const ActiveDeactiveFilter()),
        expect: () => <SearchTransactionsState>[
          SearchTransactionsState(
            status: FormzStatus.submissionSuccess,
            transactions: tFilterReceivedTransactions,
            filterOptionSelect: TransactionFilterOption.receive,
            filterIndex: widthFilterLabel,
          ),
          SearchTransactionsState(
            status: FormzStatus.submissionSuccess,
            transactions: tUserTransactionList,
          ),
        ],
      );
    });

    group('SearchTermChanged', () {
      group('whit filter not active', () {
        blocTest<SearchTransactionsBloc, SearchTransactionsState>(
          'emit a list of `UserTransaction` when `SearchTermChanged` is added '
          'and the filter is not active.',
          setUp: () {
            when(() => mockTransactionsRepository.getLatestTransactions(
                  searchTerm: tSearchTerm,
                )).thenAnswer((_) async => Right(tFilterSendTransactions));
          },
          build: () => SearchTransactionsBloc(
            transactionRepository: mockTransactionsRepository,
          ),
          seed: () =>
              SearchTransactionsState(transactions: tUserTransactionList),
          act: (bloc) => bloc
            ..add(const GetAllTransactions())
            ..add(const SearchTermChanged(searchTerm: tSearchTerm)),
          skip: 2,
          expect: () => <SearchTransactionsState>[
            SearchTransactionsState(
              status: FormzStatus.submissionInProgress,
              transactions: tUserTransactionList,
              searchTerm: const NameFormz.dirty(tSearchTerm),
            ),
            SearchTransactionsState(
              status: FormzStatus.submissionSuccess,
              transactions: tFilterSendTransactions,
              searchTerm: const NameFormz.dirty(tSearchTerm),
            ),
          ],
        );
      });
      group('emit a list of `UserTransaction` when', () {
        blocTest<SearchTransactionsBloc, SearchTransactionsState>(
          'filter is active in `all` and [searchTerm] is dirty.',
          setUp: () {
            when(
              () => mockTransactionsRepository.getLatestTransactions(
                searchTerm: tSearchTerm,
              ),
            ).thenAnswer((_) async => Right(tUserTransactionList));
          },
          build: () => SearchTransactionsBloc(
            transactionRepository: mockTransactionsRepository,
          ),
          skip: 3,
          act: (bloc) => bloc
            ..add(const GetAllTransactions())
            ..add(const ActiveDeactiveFilter())
            ..add(const SearchTermChanged(searchTerm: tSearchTerm)),
          expect: () => <SearchTransactionsState>[
            SearchTransactionsState(
              status: FormzStatus.submissionInProgress,
              transactions: tUserTransactionList,
              filterOptionSelect: TransactionFilterOption.all,
              searchTerm: const NameFormz.dirty(tSearchTerm),
            ),
            SearchTransactionsState(
              status: FormzStatus.submissionSuccess,
              transactions: tUserTransactionList,
              filterOptionSelect: TransactionFilterOption.all,
              searchTerm: const NameFormz.dirty(tSearchTerm),
            ),
          ],
        );
        blocTest<SearchTransactionsBloc, SearchTransactionsState>(
          'filter is active in `send` and [searchTerm] is dirty.',
          setUp: () {
            when(
              () => mockTransactionsRepository.getLatestTransactions(
                searchTerm: tSearchTerm,
              ),
            ).thenAnswer((_) async => Right(tUserTransactionList));
          },
          build: () => SearchTransactionsBloc(
            transactionRepository: mockTransactionsRepository,
          ),
          skip: 3,
          act: (bloc) => bloc
            ..add(const GetAllTransactions())
            ..add(const ActiveDeactiveFilter())
            ..add(const ChangeFilterSelect(
              select: TransactionFilterOption.send,
              widthFilterLabel: widthFilterLabel,
            ))
            ..add(const SearchTermChanged(searchTerm: tSearchTerm)),
          expect: () => <SearchTransactionsState>[
            SearchTransactionsState(
              status: FormzStatus.submissionSuccess,
              transactions: tFilterSendTransactions,
              filterOptionSelect: TransactionFilterOption.send,
              filterIndex: widthFilterLabel,
            ),
            SearchTransactionsState(
              status: FormzStatus.submissionInProgress,
              transactions: tFilterSendTransactions,
              filterOptionSelect: TransactionFilterOption.send,
              searchTerm: const NameFormz.dirty(tSearchTerm),
              filterIndex: widthFilterLabel,
            ),
            SearchTransactionsState(
              status: FormzStatus.submissionSuccess,
              transactions: tUserTransactionList,
              filterOptionSelect: TransactionFilterOption.send,
              searchTerm: const NameFormz.dirty(tSearchTerm),
              filterIndex: widthFilterLabel,
            ),
            SearchTransactionsState(
              status: FormzStatus.submissionSuccess,
              transactions: tFilterSendTransactions,
              filterOptionSelect: TransactionFilterOption.send,
              searchTerm: const NameFormz.dirty(tSearchTerm),
              filterIndex: widthFilterLabel,
            ),
          ],
        );

        blocTest<SearchTransactionsBloc, SearchTransactionsState>(
          'filter is active in `receive` and [searchTerm] is dirty.',
          setUp: () {
            when(
              () => mockTransactionsRepository.getLatestTransactions(
                searchTerm: tSearchTerm,
              ),
            ).thenAnswer((_) async => Right(tUserTransactionList));
          },
          build: () => SearchTransactionsBloc(
            transactionRepository: mockTransactionsRepository,
          ),
          skip: 3,
          act: (bloc) => bloc
            ..add(const GetAllTransactions())
            ..add(const ActiveDeactiveFilter())
            ..add(const ChangeFilterSelect(
              select: TransactionFilterOption.receive,
              widthFilterLabel: widthFilterLabel,
            ))
            ..add(const SearchTermChanged(searchTerm: tSearchTerm)),
          expect: () => <SearchTransactionsState>[
            SearchTransactionsState(
              status: FormzStatus.submissionSuccess,
              transactions: tFilterReceivedTransactions,
              filterOptionSelect: TransactionFilterOption.receive,
              filterIndex: widthFilterLabel,
            ),
            SearchTransactionsState(
              status: FormzStatus.submissionInProgress,
              transactions: tFilterReceivedTransactions,
              filterOptionSelect: TransactionFilterOption.receive,
              searchTerm: const NameFormz.dirty(tSearchTerm),
              filterIndex: widthFilterLabel,
            ),
            SearchTransactionsState(
              status: FormzStatus.submissionSuccess,
              transactions: tUserTransactionList,
              filterOptionSelect: TransactionFilterOption.receive,
              searchTerm: const NameFormz.dirty(tSearchTerm),
              filterIndex: widthFilterLabel,
            ),
            SearchTransactionsState(
              status: FormzStatus.submissionSuccess,
              transactions: tFilterReceivedTransactions,
              filterOptionSelect: TransactionFilterOption.receive,
              searchTerm: const NameFormz.dirty(tSearchTerm),
              filterIndex: widthFilterLabel,
            ),
          ],
        );
      });

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
        act: (bloc) => bloc
          ..add(const GetAllTransactions())
          ..add(const SearchTermChanged(searchTerm: tSearchTerm)),
        skip: 2,
        expect: () => <SearchTransactionsState>[
          SearchTransactionsState(
            status: FormzStatus.submissionInProgress,
            transactions: tUserTransactionList,
            searchTerm: const NameFormz.dirty(tSearchTerm),
          ),
          SearchTransactionsState(
            status: FormzStatus.submissionFailure,
            transactions: tUserTransactionList,
            searchTerm: const NameFormz.dirty(tSearchTerm),
            errorMessage: 'Server Failure',
          ),
        ],
      );
    });

    group('CleanFilter', () {
      blocTest<SearchTransactionsBloc, SearchTransactionsState>(
        'emit [searchTerm] equal to `NameFormz.pure`',
        setUp: () {
          when(
            () => mockTransactionsRepository.getLatestTransactions(
              searchTerm: tSearchTerm,
            ),
          ).thenAnswer((_) async => Right(tUserTransactionList));
        },
        build: () => SearchTransactionsBloc(
          transactionRepository: mockTransactionsRepository,
        ),
        skip: 5,
        act: (bloc) => bloc
          ..add(const GetAllTransactions())
          ..add(const ActiveDeactiveFilter())
          ..add(const SearchTermChanged(searchTerm: tSearchTerm))
          ..add(const CleanFilter()),
        expect: () => <SearchTransactionsState>[
          SearchTransactionsState(
            status: FormzStatus.submissionSuccess,
            transactions: tUserTransactionList,
            filterOptionSelect: TransactionFilterOption.all,
          ),
        ],
      );
    });
  });
}
